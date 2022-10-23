import { postAnalyticsEvent } from "system/storage/StorageInterface";
import { FEATURE_VISUALIZE_HAULING } from "utils/featureToggles/FeatureToggleConstants";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { Log } from "utils/logger/Logger";
import { PriorityQueue } from "utils/PriorityQueue";
import { profile } from "utils/profiler/Profiler";
import { Traveler } from "utils/traveler/Traveler";
import { clamp, findSortedIndex, insertSorted, insertSortedAndTruncate, maxBy } from "utils/UtilityFunctions";

const MAX_ASSIGNMENTS_PER_NODE = 10; //No more than this many creeps assigned to a single node

//Have hauler carry out its assignment. Will return true if done with current assignment

@profile
class HaulerLogic {
    private pairingComparitor = (a: LogisticsPairing, b: LogisticsPairing) => a.eta - b.eta;

    public runHauler(
        creep: Creep,
        assignment: LogisticsPairing,
        targetNode: LogisticsNode,
        storage: MainStorage,
        parentRoomName: string,
        analyticsCategories: string[],
        runResults?: HaulerRunResults
    ): HaulerRunResults {
        if (!assignment || !targetNode) {
            Log.e(`Hauler ${creep.name} does not have job! This should not happen`);
            return {
                newUsedCapacity: creep.store.getUsedCapacity(),
                newFreeCapacity: creep.store.getFreeCapacity(),
                usedMove: false,
                usedTransfer: false,
                usedPickup: false,
                done: true,
                invalidNode: false
            };
        }

        if (!runResults) {
            runResults = {
                newUsedCapacity: creep.store.getUsedCapacity(targetNode.resource as ResourceConstant),
                newFreeCapacity: creep.store.getFreeCapacity(targetNode.resource as ResourceConstant),
                usedMove: false,
                usedTransfer: false,
                usedPickup: false,
                done: false,
                invalidNode: false
            };
        }

        let target: LogisticsNodeTarget | null = this.lookupNodeTarget(targetNode.targetId);
        let targetPos = target?.pos ?? targetNode.lastKnownPosition;
        let resource = targetNode.resource as ResourceConstant;

        //Sometimes we get bad nodes that crop up. Remove them when we find them
        if (!target && creep.pos.roomName === targetPos.roomName) {
            runResults.invalidNode = true;
            runResults.done = true;
            return runResults;
        }

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
            } else if (
                !assignment.usesServiceRoute ||
                runResults.newFreeCapacity === creep.store.getCapacity(resource)
            ) {
                //head to target
                if (creep.pos.isNearTo(targetPos) && target && this.canTransferOrPickup(target, runResults)) {
                    this.withdrawFrom(
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
        }
        //Handle sink requests
        else {
            let amount = assignment.deltaAtETA;
            if (!canServiceSinkRequests) {
                runResults.done = true;
            } else if (!assignment.usesServiceRoute || runResults.newUsedCapacity >= amount) {
                //head to target and deposit
                if (creep.pos.isNearTo(targetPos) && target && !runResults.usedTransfer) {
                    this.depositInto(creep, resource, Math.abs(assignment.deltaAtETA), target, runResults, targetNode);
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
                        this.withdrawFrom(
                            creep,
                            resource,
                            Math.abs(assignment.deltaAtETA),
                            storage,
                            runResults,
                            targetNode,
                            parentRoomName,
                            analyticsCategories
                        );
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
    public assignJobForHauler(
        creep: Creep,
        haulerAssignments: { [haulerName: string]: LogisticsPairing },
        nodeAssignments: { [nodeId: string]: LogisticsPairing[] },
        logisticsNodes: { [id: string]: LogisticsNode },
        storage: MainStorage,
        prevResults?: HaulerRunResults
    ): LogisticsPairing | null {
        let servicableNodes = Object.values(logisticsNodes).filter(node => {
            const nodeResource = node.resource as ResourceConstant;
            const canServiceSourceRequests =
                (storage!.store.getFreeCapacity(nodeResource) ?? 0) > 0 ||
                creep.store.getFreeCapacity(nodeResource) > 0;
            const canServiceSinkRequests =
                (storage!.store.getUsedCapacity(nodeResource) ?? 0) > 0 ||
                creep.store.getUsedCapacity(nodeResource) > 0;

            return (
                (canServiceSinkRequests && node.type === "Sink") || (canServiceSourceRequests && node.type === "Source")
            );
        });
        if (servicableNodes.length) {
            const possiblePairings: { [nodeId: string]: LogisticsPairing } = {};
            // Log.d(
            //     `Starting node evaluation for ${creep.name}. Existing assignments are ${JSON.stringify(nodeAssignments)}`
            // );
            servicableNodes.forEach(node => {
                let pair = this.generatePair(creep, node, storage!, nodeAssignments, haulerAssignments, prevResults);

                //Drdt should always be positive
                if (pair.drdt > 1 || node.priorityScalar) possiblePairings[node.nodeId] = pair;
            });
            const bestPairing = maxBy(
                Object.values(possiblePairings),
                pairing => pairing.drdt * (logisticsNodes[pairing.nodeId].priorityScalar ?? 1)
            );

            if (bestPairing != null) {
                if (!nodeAssignments[bestPairing.nodeId]) nodeAssignments[bestPairing.nodeId] = [];
                let assignments = nodeAssignments[bestPairing.nodeId];

                let newIndex = findSortedIndex(bestPairing, assignments, this.pairingComparitor);

                //We are shortcutting several other haulers, make sure they pick a new job
                for (let i = newIndex; i < assignments.length; i++) {
                    delete haulerAssignments[assignments[i].haulerName];
                }
                haulerAssignments[creep.name] = bestPairing;
                //Add the new best pairing at the sorted index, throwing out everything after
                nodeAssignments[bestPairing.nodeId].splice(newIndex, Infinity, bestPairing);

                return bestPairing;
            }
        }
        // Log.d(`Failed to find a valid node pairing for ${creep.name}`);
        return null;
    }

    public lookupNodeTarget(nodeId: string): LogisticsNodeTarget | null {
        //In the case it is a creep
        if (Game.creeps[nodeId]) return Game.creeps[nodeId];

        let gameObject = Game.getObjectById(nodeId);
        if (gameObject) return gameObject as LogisticsNodeTarget;

        return null;
    }

    //Will evaluate and generate a pairing between a creep and a logistics node. Also decides if we should make a trip to the storage before servicing the request
    generatePair(
        creep: Creep,
        node: LogisticsNode,
        storage: MainStorage,
        nodeAssignments: { [nodeId: string]: LogisticsPairing[] },
        haulerAssignments: { [haulerName: string]: LogisticsPairing },
        prevResults?: HaulerRunResults
    ): LogisticsPairing {
        const nodeResource = node.resource as ResourceConstant;
        let nodeTarget = this.lookupNodeTarget(node.targetId);
        let pos = nodeTarget?.pos ?? node.lastKnownPosition;

        let directDistance = creep.pos.getMultiRoomRangeTo(pos);
        let serviceDistance =
            creep.pos.getMultiRoomRangeTo(storage.pos) +
            creep.getTicksToMove(node.serviceRoute.pathCost, node.serviceRoute.pathLength);

        let directEta = Game.time + directDistance;
        let serviceEta = Game.time + serviceDistance;

        const usedSpace = prevResults?.newUsedCapacity ?? creep.store.getUsedCapacity(nodeResource);
        const freeSpace = prevResults?.newFreeCapacity ?? creep.store.getFreeCapacity(nodeResource);

        //How much space we would have after freeing up using the storage
        const storageFreeableCapacity = clamp(
            freeSpace + (storage.store.getFreeCapacity(nodeResource) ?? 0),
            0,
            creep.store.getCapacity(nodeResource)
        );

        //Amount we would have if we grabbed more from the storage
        let storageFillableCapacity = clamp(
            usedSpace + (storage.store.getUsedCapacity(nodeResource) ?? 0),
            0,
            creep.store.getCapacity(nodeResource)
        );

        //If it is still a spawn we won't pull energy from it. The fillable cap is just the amount we already have
        if (storage instanceof StructureSpawn || storage instanceof StructureContainer) {
            storageFillableCapacity = usedSpace;
        }

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

        // Log.d(`\tCalculating node ${node.nodeId}`);

        //The predicted resource level if we were to head directly there. Init it to the current level, and then add
        let directResourceLevel = node.level;
        //The predicted resource level if we take the service route. Init it to the current level, and then add
        let serviceResourceLevel = node.level;

        //Currently, the directDelta and serviceDelta only represent the best the creep can do. They don't factor in
        //the other pairings we already have. We have to factor those in here. Sadly, this is a pain
        let lastDirectUpdate = 0;
        let lastServiceUpdate = 0;

        //Sometimes creeps get their job stolen and the reservation sticks around. We prevent that with this
        if (nodeAssignments[node.nodeId]?.length > 0 && nodeAssignments[node.nodeId][0].eta < Game.time) {
            nodeAssignments[node.nodeId] = nodeAssignments[node.nodeId].filter(
                pair => Game.creeps[pair.haulerName] && haulerAssignments[pair.haulerName]?.nodeId === pair.nodeId
            );
        }

        let otherNodePairings = nodeAssignments[node.nodeId] ?? [];

        // Log.d(`\t\tStarting levels are direct: ${directResourceLevel} service: ${serviceResourceLevel}`);

        for (let pairing of otherNodePairings) {
            //only factor in pairings that happen before us
            if (pairing?.eta > serviceEta) {
                break;
            }

            if (pairing) {
                //We get there faster by going direct. We keep that in mind with this
                if (pairing.eta < directEta) {
                    directResourceLevel += this.getDeltaAppliedAfterTime(
                        directResourceLevel,
                        lastDirectUpdate,
                        pairing.eta,
                        pairing.deltaAtETA,
                        node,
                        false
                    );
                    // Log.d(
                    //     `\t\tDIRECT: ${pairing.haulerName} arrives after ${pairing.eta - Game.time} ticks. Delta:${
                    //         pairing.deltaAtETA
                    //     } New Level:${directResourceLevel}`
                    // );
                    lastDirectUpdate = pairing.eta;
                }

                // Log.d(
                //     `\t\tSERVICE: Pairing ${pairing.haulerName} after ${pairing.eta - Game.time} ticks. Delta:${
                //         pairing.deltaAtETA
                //     } New Level:${directResourceLevel}`
                // );
                serviceResourceLevel += this.getDeltaAppliedAfterTime(
                    serviceResourceLevel,
                    lastServiceUpdate,
                    pairing.eta,
                    pairing.deltaAtETA,
                    node,
                    false
                );
                lastServiceUpdate = pairing.eta;
            }
        }
        directDelta = this.getDeltaAppliedAfterTime(
            directResourceLevel,
            lastDirectUpdate,
            directEta,
            directDelta,
            node,
            true
        );
        serviceDelta = this.getDeltaAppliedAfterTime(
            serviceResourceLevel,
            lastServiceUpdate,
            serviceEta,
            serviceDelta,
            node,
            true
        );

        var directDrdt = directDelta / (directEta - Game.time);
        var serviceDrdt = serviceDelta / (serviceEta - Game.time);

        if (node.type === "Source") {
            directDrdt = directDrdt * -1;
            serviceDrdt = serviceDrdt * -1;
        }

        // Log.d(
        //     `\t\tDIRECT: Finished evaluating. Delta:${directDelta} after ${directEta - Game.time} for DRDT:${directDrdt}`
        // );
        // Log.d(
        //     `\t\tSERVICE: Finished evaluating. Delta:${serviceDelta} after ${
        //         serviceEta - Game.time
        //     } for DRDT:${serviceDrdt}`
        // );

        //All that work for this one little flag...
        let useServiceRoute = serviceDrdt > directDrdt;

        return {
            haulerName: creep.name,
            nodeId: node.nodeId,
            eta: useServiceRoute ? serviceEta : directEta,
            usesServiceRoute: useServiceRoute,
            deltaAtETA: useServiceRoute ? serviceDelta : directDelta,
            drdt: useServiceRoute ? serviceDrdt : directDrdt,
            queueIndex: 0 //Will get overwritten
        };
    }

    //This is a complicated one. Factors in passive rate of change and can either return how effective the creep was, or how much the level changed.
    getDeltaAppliedAfterTime(
        lastLevel: number,
        lastUpdate: number,
        eta: number,
        delta: number,
        node: LogisticsNode,
        returnAppliedDelta: boolean
    ): number {
        if (lastUpdate == 0) lastUpdate = eta;

        const passiveLevel = clamp(lastLevel + (eta - lastUpdate) * node.baseDrdt, 0, node.maxLevel);
        const levelWithDelta = clamp(passiveLevel + delta, 0, node.maxLevel);

        if (returnAppliedDelta) {
            return levelWithDelta - passiveLevel;
        } else {
            return levelWithDelta - lastLevel;
        }
    }

    depositInto(
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

    withdrawFrom(
        creep: Creep,
        resource: ResourceConstant,
        amount: number,
        target: LogisticsNodeTarget,
        runResults: HaulerRunResults,
        logisticsNodeToUpdate: LogisticsNode,
        parentRoomName: string,
        analyticsCategories: string[]
    ): void {
        if (
            (Memory.season1 && target instanceof ScoreCollector) ||
            (Memory.season2 && target instanceof SymbolDecoder)
        ) {
            console.log(
                `Hauler ${creep.name} tried to withdraw from an object of type ${typeof target}, which is not allowed`
            );
        } else if (target instanceof Resource) {
            amount = Math.min(
                logisticsNodeToUpdate.disableLimitedGrab ? Infinity : target.amount,
                creep.store.getFreeCapacity(target.resourceType),
                runResults.newFreeCapacity
            );
            creep.pickup(target);
            logisticsNodeToUpdate.level -= amount;
            runResults.newUsedCapacity += amount;
            runResults.usedPickup = true;
            runResults.done = true;
        } else if (target instanceof Creep) {
            amount = Math.min(
                logisticsNodeToUpdate.disableLimitedGrab ? Infinity : amount,
                target.store.getUsedCapacity(resource),
                creep.store.getFreeCapacity(resource),
                runResults.newFreeCapacity
            );
            target.transfer(creep, resource, amount);
            logisticsNodeToUpdate.level -= amount;
            runResults.newUsedCapacity += amount;
            runResults.usedTransfer = true;
            runResults.done = true;
        } else if (target) {
            amount = Math.min(
                logisticsNodeToUpdate.disableLimitedGrab ? Infinity : amount,
                (target as any).store.getUsedCapacity(resource) ?? 0,
                creep.store.getFreeCapacity(resource)
            );
            creep.withdraw(target as any, resource, amount);
            runResults.newUsedCapacity += amount;
            logisticsNodeToUpdate.level -= amount;
            runResults.usedTransfer = true;
            runResults.done = true;
        } else {
            console.log(
                `Hauler ${creep.name} was unable to identify and withdraw from target ${JSON.stringify(target)}`
            );
        }
    }

    canTransferOrPickup(target: LogisticsNodeTarget, runResults: HaulerRunResults): boolean {
        let isResource = target instanceof Resource;
        return (isResource && !runResults.usedPickup) || (!isResource && !runResults.usedTransfer);
    }
}

export const haulerLogic: HaulerLogic = new HaulerLogic();
