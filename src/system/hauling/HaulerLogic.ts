import { postAnalyticsEvent } from "system/storage/StorageInterface";
import { FEATURE_VISUALIZE_HAULING } from "utils/featureToggles/FeatureToggleRegistry";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { PriorityQueue } from "utils/PriorityQueue";
import { Traveler } from "utils/traveler/Traveler";
import { clamp } from "utils/UtilityFunctions";

//Have hauler carry out its assignment. Will return true if done with current assignment
export function _runHauler(
    creep: Creep,
    assignment: LogisticsPairing,
    targetNode: LogisticsNode,
    storage: MainStorage,
    parentRoomName: string,
    analyticsCategories: string[],
    runResults?: HaulerRunResults
): HaulerRunResults {
    if (!assignment || !targetNode) {
        console.log(`Hauler ${creep.name} does not have job! This should not happen`);
        return {
            newUsedCapacity: creep.store.getUsedCapacity(),
            newFreeCapacity: creep.store.getFreeCapacity(),
            usedMove: false,
            usedTransfer: false,
            usedPickup: false,
            done: true
        };
    }

    if (!runResults) {
        runResults = {
            newUsedCapacity: creep.store.getUsedCapacity(targetNode.resource as ResourceConstant),
            newFreeCapacity: creep.store.getFreeCapacity(targetNode.resource as ResourceConstant),
            usedMove: false,
            usedTransfer: false,
            usedPickup: false,
            done: false
        };
    }

    let target: LogisticsNodeTarget | null = _lookupNodeTarget(targetNode.targetId);
    let targetPos = target?.pos ?? targetNode.lastKnownPosition;
    let resource = targetNode.resource as ResourceConstant;

    if (getFeature(FEATURE_VISUALIZE_HAULING)) {
        let color = targetNode.type === "Sink" ? "green" : "yellow";

        if (creep.room.name === targetPos.roomName) {
            creep.room.visual.line(creep.pos, targetPos, {
                color: color
            });
        }
    }

    const nodeResource = targetNode.resource as ResourceConstant;
    const canServiceSourceRequests =
        (storage.store.getFreeCapacity(nodeResource) ?? 0) > 0 || runResults.newFreeCapacity > 0;
    const canServiceSinkRequests =
        (storage.store.getUsedCapacity(nodeResource) ?? 0) > 0 || runResults.newUsedCapacity > 0;

    if (targetNode.type === "Source") {
        if (!canServiceSourceRequests) {
            runResults.done = true;
        } else if (!assignment.usesServiceRoute || runResults.newFreeCapacity === creep.store.getCapacity(resource)) {
            //head to target
            if (creep.pos.isNearTo(targetPos) && target && canTransferOrPickup(target, runResults)) {
                withdrawFrom(
                    creep,
                    resource,
                    Math.abs(assignment.deltaAtETA),
                    target,
                    runResults,
                    targetNode,
                    parentRoomName,
                    analyticsCategories
                );
                creep.queueSay("🔽");
            } else if (!creep.pos.isNearTo(targetPos) && !runResults.usedMove) {
                Traveler.travelTo(creep, targetPos);
                runResults.usedMove = true;
                creep.queueSay("🚚");
            }
        } else {
            //empty at storage
            if (creep.pos.isNearTo(storage) && !runResults.usedTransfer) {
                let storeKeys = Object.keys(creep.store).map(k => k as ResourceConstant);
                if (storeKeys.length) {
                    creep.transfer(storage, storeKeys[0]);
                    runResults.usedTransfer = true;
                }
                runResults.done = false;
                creep.queueSay("🔼");
                if (runResults.usedTransfer) {
                    Traveler.travelTo(creep, targetPos);
                    creep.queueSay("🚚");
                }
            } else if (!runResults.usedMove && !creep.pos.isNearTo(storage)) {
                Traveler.travelTo(creep, storage);
                runResults.done = false;
                runResults.usedMove = true;
                creep.queueSay("🏧");
            }
        }
    } else {
        let amount = assignment.deltaAtETA;
        if (!canServiceSinkRequests) {
            runResults.done = true;
        } else if (!assignment.usesServiceRoute || runResults.newUsedCapacity >= amount) {
            //head to target and deposit
            if (creep.pos.isNearTo(targetPos) && target && !runResults.usedTransfer) {
                depositInto(creep, resource, Math.abs(assignment.deltaAtETA), target, runResults, targetNode);
            } else if (!creep.pos.isNearTo(targetPos)) {
                Traveler.travelTo(creep, targetPos);
                runResults.usedMove = true;
                runResults.done = false;
                creep.queueSay("🚚");
            }
        } else {
            //fill up at storage before heading to target
            if (creep.pos.isNearTo(storage) && !runResults.usedTransfer) {
                let unwanted = Object.keys(creep.store)
                    .map(r => r as ResourceConstant)
                    .filter(creepResource => resource !== creepResource);
                if (unwanted.length) {
                    creep.transfer(storage, unwanted[0]);
                    runResults.done = false;
                    runResults.usedTransfer = true;
                    creep.queueSay("🔼");
                } else {
                    let amount = Math.min(
                        creep.store.getCapacity(resource),
                        assignment.deltaAtETA,
                        storage.store.getUsedCapacity(resource) ?? 0
                    );
                    creep.withdraw(storage, resource, amount);
                    runResults.done = false;
                    runResults.usedTransfer = true;
                    creep.queueSay("🔽");
                    if (runResults.usedTransfer) {
                        Traveler.travelTo(creep, targetPos);
                        creep.queueSay("🚚");
                    }
                }
            } else if (!creep.pos.isNearTo(storage) && !runResults.usedMove) {
                Traveler.travelTo(creep, storage);
                runResults.usedMove = true;
                runResults.done = false;
                creep.queueSay("🏧");
            }
        }
    }

    return runResults;
}

//assigns a hauling job to the creep that doesnt already have one, or returns null if none are available
export function _assignJobForHauler(
    creep: Creep,
    haulerAssignments: { [haulerName: string]: LogisticsPairing },
    nodeAssignments: { [nodeId: string]: PriorityQueue<LogisticsPairing> },
    logisticsNodes: { [id: string]: LogisticsNode },
    storage: MainStorage,
    prevResults?: HaulerRunResults
): LogisticsPairing | null {
    let servicableNodes = Object.values(logisticsNodes).filter(node => {
        const nodeResource = node.resource as ResourceConstant;
        const canServiceSourceRequests =
            (storage!.store.getFreeCapacity(nodeResource) ?? 0) > 0 || creep.store.getFreeCapacity(nodeResource) > 0;
        const canServiceSinkRequests =
            (storage!.store.getUsedCapacity(nodeResource) ?? 0) > 0 || creep.store.getUsedCapacity(nodeResource) > 0;

        return (canServiceSinkRequests && node.type === "Sink") || (canServiceSourceRequests && node.type === "Source");
    });
    if (servicableNodes.length) {
        const possiblePairings: { [nodeId: string]: LogisticsPairing } = {};
        servicableNodes.forEach(
            node => (possiblePairings[node.nodeId] = generatePair(creep, node, storage!, nodeAssignments, prevResults))
        );
        const bestPairing = _.max(possiblePairings, pairing => pairing.drdt);

        // Log.d(`All nodes: ${JSON.stringify(logisticsNodes)}`);
        // Log.d(`Servicable nodes: ${JSON.stringify(servicableNodes)}`);
        // Log.d(`Previous assignments: ${JSON.stringify(nodeAssignments)}`);
        // Log.d("Possible pairings: " + JSON.stringify(possiblePairings));
        // Log.d("Best pairing: " + JSON.stringify(bestPairing));
        nodeAssignments[bestPairing.nodeId].enqueue(bestPairing);
        haulerAssignments[creep.name] = bestPairing;

        //If you shortcut another creep's assignment, make sure they pick new jobs
        let truncated = nodeAssignments[bestPairing.nodeId].truncateAfter(bestPairing);
        for (let removedPairing of truncated) {
            delete haulerAssignments[removedPairing.haulerName];
        }
        return bestPairing;
    }
    return null;
}

export function _lookupNodeTarget(nodeId: string): LogisticsNodeTarget | null {
    //In the case it is a creep
    if (Game.creeps[nodeId]) return Game.creeps[nodeId];

    let gameObject = Game.getObjectById(nodeId);
    if (gameObject) return gameObject as LogisticsNodeTarget;

    return null;
}

//Will evaluate and generate a pairing between a creep and a logistics node. Also decides if we should make a trip to the storage before servicing the request
function generatePair(
    creep: Creep,
    node: LogisticsNode,
    storage: MainStorage,
    nodeAssignments: { [nodeId: string]: PriorityQueue<LogisticsPairing> },
    prevResults?: HaulerRunResults
): LogisticsPairing {
    const nodeResource = node.resource as ResourceConstant;
    let nodeTarget = _lookupNodeTarget(node.targetId);
    let pos = nodeTarget?.pos ?? node.lastKnownPosition;

    //console.log(`Generating pair for ${creep.name} with node ${JSON.stringify(node)} and prev results ${JSON.stringify(prevResults? prevResults : "")}`)

    let directDistance = creep.pos.getMultiRoomRangeTo(pos);
    let serviceDistance =
        creep.pos.getMultiRoomRangeTo(storage.pos) +
        creep.getTicksToMove(node.serviceRoute.pathCost, node.serviceRoute.pathLength);

    let directEta = Game.time + directDistance;
    let serviceEta = Game.time + serviceDistance;

    const usedSpace = prevResults?.newUsedCapacity ?? creep.store.getUsedCapacity(nodeResource);
    const freeSpace = prevResults?.newFreeCapacity ?? creep.store.getFreeCapacity(nodeResource);

    //Amount we can free up using storage
    const storageFreeableCapacity = Math.min(
        creep.store.getCapacity(nodeResource),
        storage.store.getFreeCapacity(nodeResource) ?? 0
    );
    //Amount we can fill up on using storage
    const storageFillableCapacity = Math.min(
        creep.store.getCapacity(nodeResource),
        storage instanceof StructureSpawn ? 0 : storage.store.getUsedCapacity(RESOURCE_ENERGY)
    );

    var directDelta = 0;
    var serviceDelta = 0;

    if (node.type === "Sink") {
        //if its a sink request we can contribute the used space we have
        directDelta = usedSpace;
        //if its a sink request we can contribute the amount we can grab from the storage
        serviceDelta = storageFillableCapacity;
    } else {
        //if its a source request we can grab the amount of free space we have
        directDelta = freeSpace * -1;
        //if its a source request we can grab the amount of space we would have after visiting storage
        serviceDelta = storageFreeableCapacity * -1;
    }

    //The predicted resource level if we were to head directly there
    let directResourceLevel = node.level;
    //The predicted resource level if we take the service route
    let serviceResourceLevel = node.level;

    //Currently, the directDelta and serviceDelta only represent the best the creep can do. They don't factor in
    //the other pairing we already have. We have to factor those in here. Sadly, this is a pain
    let lastDirectUpdate = 0;
    let lastServiceUpdate = 0;
    let otherNodePairings = nodeAssignments[node.nodeId]?.items ?? [];
    for (let pairing of otherNodePairings) {
        //only factor in pairings that happen before us
        if (pairing?.eta > serviceEta) {
            break;
        }

        if (pairing) {
            if (pairing.eta < directEta) {
                directResourceLevel += getResourceDelta(
                    directResourceLevel,
                    lastDirectUpdate,
                    pairing.eta,
                    pairing.deltaAtETA,
                    node
                );
                lastDirectUpdate = pairing.eta;
            }
            serviceResourceLevel += getResourceDelta(
                serviceResourceLevel,
                lastServiceUpdate,
                pairing.eta,
                pairing.deltaAtETA,
                node
            );
            lastServiceUpdate = pairing.eta;
        }
    }
    directDelta = getResourceDelta(directResourceLevel, lastDirectUpdate, directEta, directDelta, node);
    serviceDelta = getResourceDelta(serviceResourceLevel, lastServiceUpdate, serviceEta, serviceDelta, node);

    var directDrdt = directDelta / (directEta - Game.time);
    var serviceDrdt = serviceDelta / (serviceEta - Game.time);

    if (node.type === "Source") {
        directDrdt = directDrdt * -1;
        serviceDrdt = serviceDrdt * -1;
    }

    //All that work for this one little flag...
    let useServiceRoute = serviceDrdt >= directDrdt;

    // console.log(`Drdt readouts for node:${node.id} direct:${directDrdt} service:${serviceDrdt}`)

    return {
        haulerName: creep.name,
        nodeId: node.nodeId,
        eta: useServiceRoute ? serviceEta : directEta,
        queueIndex: useServiceRoute ? serviceEta : directEta,
        usesServiceRoute: useServiceRoute,
        deltaAtETA: useServiceRoute ? serviceDelta : directDelta,
        drdt: useServiceRoute ? serviceDrdt : directDrdt
    };
}

function getResourceDelta(
    lastLevel: number,
    lastUpdate: number,
    eta: number,
    delta: number,
    node: LogisticsNode
): number {
    if (lastUpdate == 0) lastUpdate = eta;

    var level = lastLevel + (eta - lastUpdate) * node.baseDrdt;
    level += delta;
    level = clamp(level, 0, node.maxLevel);
    return level - lastLevel;
}

function depositInto(
    creep: Creep,
    resource: ResourceConstant,
    amount: number,
    target: LogisticsNodeTarget,
    runResults: HaulerRunResults,
    logisticsNodeToUpdate: LogisticsNode
): void {
    if (
        target instanceof Resource ||
        target instanceof Tombstone ||
        target instanceof Ruin ||
        (Memory.season1 && target instanceof ScoreContainer) ||
        (Memory.season2 && target instanceof SymbolContainer)
    ) {
        console.log(
            `Hauler ${creep.name} tried to deposit into an object of type ${typeof target}, which is not allowed`
        );
    } else if (
        (Memory.season1 && target instanceof ScoreCollector) ||
        (Memory.season2 && target instanceof SymbolDecoder)
    ) {
        creep.transfer(target, resource);
        runResults.usedTransfer = true;
        runResults.newUsedCapacity = 0;
        runResults.done = true;
    } else if (!Memory.season1 && !Memory.season2) {
        //The typing are safe, its just not smart enough to see that. Some any casting was needed
        amount = Math.min(
            amount,
            creep.store.getUsedCapacity(resource),
            (target as any).store.getFreeCapacity(resource) ?? 0
        );
        creep.transfer(target as any, resource, amount);
        logisticsNodeToUpdate.level += amount;
        runResults.usedTransfer = true;
        runResults.newUsedCapacity -= amount;
        runResults.done = true;
    }
}

function withdrawFrom(
    creep: Creep,
    resource: ResourceConstant,
    amount: number,
    target: LogisticsNodeTarget,
    runResults: HaulerRunResults,
    logisticsNodeToUpdate: LogisticsNode,
    parentRoomName: string,
    analyticsCategories: string[]
): void {
    if ((Memory.season1 && target instanceof ScoreCollector) || (Memory.season2 && target instanceof SymbolDecoder)) {
        console.log(
            `Hauler ${creep.name} tried to withdraw from an object of type ${typeof target}, which is not allowed`
        );
    } else if (target instanceof Resource) {
        amount = Math.min(target.amount, creep.store.getFreeCapacity(target.resourceType), runResults.newFreeCapacity);
        creep.pickup(target);
        logisticsNodeToUpdate.level -= amount;
        runResults.newUsedCapacity += amount;
        runResults.usedPickup = true;
        runResults.done = true;
        postAnalyticsEvent(
            parentRoomName,
            amount,
            "GrossIncome",
            ...analyticsCategories,
            ...logisticsNodeToUpdate.analyticsCategories
        );
    } else if (target instanceof Creep) {
        amount = Math.min(
            amount,
            target.store.getUsedCapacity(resource),
            creep.store.getFreeCapacity(resource),
            runResults.newFreeCapacity
        );
        target.transfer(creep, resource, amount);
        logisticsNodeToUpdate.level -= amount;
        runResults.newUsedCapacity += amount;
        runResults.usedTransfer = true;
        runResults.done = true;
        postAnalyticsEvent(
            parentRoomName,
            amount,
            "GrossIncome",
            ...analyticsCategories,
            ...logisticsNodeToUpdate.analyticsCategories
        );
    } else if (target) {
        amount = Math.min(
            amount,
            (target as any).store.getUsedCapacity(resource) ?? 0,
            creep.store.getFreeCapacity(resource)
        );
        creep.withdraw(target as any, resource, amount);
        runResults.newUsedCapacity += amount;
        logisticsNodeToUpdate.level -= amount;
        runResults.usedTransfer = true;
        runResults.done = true;
        postAnalyticsEvent(
            parentRoomName,
            amount,
            "GrossIncome",
            ...analyticsCategories,
            ...logisticsNodeToUpdate.analyticsCategories
        );
    } else {
        console.log(`Hauler ${creep.name} was unable to identify and withdraw from target ${JSON.stringify(target)}`);
    }
}

export const _pairingComparitor = (a: LogisticsPairing, b: LogisticsPairing) => a.eta - b.eta;

function canTransferOrPickup(target: LogisticsNodeTarget, runResults: HaulerRunResults): boolean {
    let isResource = target instanceof Resource;
    return (isResource && !runResults.usedPickup) || (!isResource && !runResults.usedTransfer);
}
