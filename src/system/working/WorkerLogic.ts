import { detect } from "lodash";
import { getNode, registerNode, unregisterNode } from "system/hauling/HaulerInterface";
import { getRallyPosition } from "system/scouting/ScoutInterface";
import {
    ANALYTICS_ARTIFICER,
    ANALYTICS_CONSTRUCTION,
    ANALYTICS_PRIEST,
    ANALYTICS_REINFORCE,
    ANALYTICS_REPAIR,
    ANALYTICS_UPGRADE
} from "system/storage/AnalyticsConstants";
import { getMainStorage, postAnalyticsEvent } from "system/storage/StorageInterface";
import { unpackPos } from "utils/Packrat";
import { Log } from "utils/logger/Logger";
import { Traveler } from "utils/traveler/Traveler";
import { getMultirooomDistance, insertSorted, minBy } from "utils/UtilityFunctions";
import { networkInterfaces } from "os";

const CONSTRUCTION_PRIORITIES = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_EXTENSION,
    STRUCTURE_RAMPART,
    STRUCTURE_TOWER,
    STRUCTURE_TERMINAL,
    STRUCTURE_LAB,
    STRUCTURE_LINK,
    STRUCTURE_FACTORY,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
    STRUCTURE_EXTRACTOR,
    STRUCTURE_CONTAINER,
    STRUCTURE_WALL,
    STRUCTURE_ROAD
];

//How ramparts are grouped
const RAMPART_HP_BUCKET = 20000;
//How many buckets apart a rampart has to be before we prioritize it regardless of distance
const PRIORITY_RAMPART_BUCKET_DIFFERENCE = 3;
//If two similar ramparts are within this difference, we just switch to going with the lowest one
const RAMPART_PRIORITIZE_HP_DISTANCE = 5;

const BUILD_PRIORITY_COMPARATOR = (a: BuildableStructureConstant, b: BuildableStructureConstant) => {
    let aIndex = CONSTRUCTION_PRIORITIES.indexOf(a);
    let bIndex = CONSTRUCTION_PRIORITIES.indexOf(b);
    if (aIndex === -1) aIndex = CONSTRUCTION_PRIORITIES.length;
    if (bIndex === -1) bIndex = CONSTRUCTION_PRIORITIES.length;
    return aIndex - bIndex;
};

interface TargetLockData {
    targetId: string;
    detailId: string;
    mining: boolean;
    restocking: boolean;
    sourcePos?: RoomPosition;
}
const TARGET_LOCK_PRUNE_DELAY = 5;
let lastTargetLockPrune = 0;
//Creep name to target locking data
let targetLocks: Map<string, TargetLockData> = new Map();

function getTargetLock(creep: Creep, detail: WorkDetail): TargetLockData | undefined {
    //First prune the target locks to prevent memory leakage
    if (Game.time - TARGET_LOCK_PRUNE_DELAY > lastTargetLockPrune) {
        let creepNames = Object.values(targetLocks);
        for (let creepName of creepNames) {
            if (!Game.creeps[creepName]) targetLocks.delete(creepName);
        }
        lastTargetLockPrune = Game.time;
    }

    //Get our target lock. Could be from a different work detail so we need to account for that
    let targetLock: TargetLockData | undefined = targetLocks.get(creep.name);

    //If we are working on a different work detail now, release the target lock
    if (targetLock?.detailId !== detail.detailId) {
        targetLock = undefined;
        targetLocks.delete(creep.name);
    }

    //If we don't have a lock, pick one to focus on
    if (!targetLock) {
        let workTarget = Object.values(detail.targets).reduce((prev, cur) =>
            compareWorkTargets(creep.pos, detail, prev, cur)
        );
        if (workTarget) {
            targetLock = { targetId: workTarget.targetId, detailId: detail.detailId, mining: false, restocking: false };
            targetLocks.set(creep.name, targetLock);
        }
    }

    return targetLock;
}

export function _assignWorkDetail(
    creep: Creep,
    pool: WorkerPool,
    details: { [detailId: string]: WorkDetail },
    assignments: Map<string, string>
): WorkDetail | undefined {
    if (!details) return undefined;

    //Figure out how many work parts are already assigned to each work detail
    let workPartsPerDetail = new Map<string, number>();
    let creepsPerDetail = new Map<string, number>();
    for (let creepName in assignments) {
        let assignedDetail = details[assignments.get(creepName) ?? ""];
        if (assignedDetail) {
            let workParts = Game.creeps[creepName].getActiveBodyparts(WORK);
            let detailId = assignedDetail.detailId;
            if (!workPartsPerDetail.get(detailId)) workPartsPerDetail.set(detailId, workParts);
            else workPartsPerDetail.set(detailId, workPartsPerDetail.get(detailId)! + workParts);

            if (!creepsPerDetail.get(detailId)) creepsPerDetail.set(detailId, 1);
            else creepsPerDetail.set(detailId, creepsPerDetail.get(detailId)! + 1);
        }
    }

    //Now find the best work detail for the creep
    return Object.values(details).reduce((prev, cur) =>
        compareWorkDetails(pool, workPartsPerDetail, creepsPerDetail, prev, cur)
    );
}

function compareWorkDetails(
    pool: WorkerPool,
    workPartsPerDetail: Map<string, number>,
    creepsPerDetail: Map<string, number>,
    detail1: WorkDetail,
    detail2: WorkDetail
): WorkDetail {
    //Handle critical tasks like emergency repair first
    if (detail1.priority === "Critical" && detail2.priority !== "Critical") return detail1;
    if (detail1.priority !== "Critical" && detail2.priority === "Critical") return detail2;

    //Handle elevated vs non-elevated
    if (detail1.priority === "Elevated" && detail2.priority !== "Elevated") return detail1;
    if (detail1.priority !== "Elevated" && detail2.priority === "Elevated") return detail2;

    //If we reach here, it meanst that they both have the same priority. This means we should prioritize our own pool first
    if (detail1.primaryPool === pool && detail2.primaryPool !== pool) return detail1;
    if (detail1.primaryPool !== pool && detail2.primaryPool === pool) return detail2;

    //They are either both of the primary pool, or both of a secondary one, and both of the same priority.
    //Go with job satisfaction next.
    let popSatisfaction1 = (creepsPerDetail.get(detail1.detailId) ?? 0) / detail1.maxCreeps;
    let popSatisfaction2 = (creepsPerDetail.get(detail2.detailId) ?? 0) / detail2.maxCreeps;
    let workSatisfaction1 = (workPartsPerDetail.get(detail1.detailId) ?? 0) / detail1.maxWorkParts;
    let workSatisfaction2 = (workPartsPerDetail.get(detail2.detailId) ?? 0) / detail2.maxWorkParts;

    //Put the creep on the one with lower work satisfaction while respecting population limits
    if (workSatisfaction1 < workSatisfaction2 && popSatisfaction1 < 1) return detail1;
    if (workSatisfaction1 > workSatisfaction2 && popSatisfaction2 < 1) return detail2;

    //If we are still tied, just assign to whichever has the most free population.
    return popSatisfaction1 - popSatisfaction2 <= 0 ? detail1 : detail2;
}

function compareWorkTargets(
    workerPos: RoomPosition,
    detail: WorkDetail,
    target1: WorkTarget,
    target2: WorkTarget
): WorkTarget {
    if (detail.detailType === "Upgrade") {
        //We will have a target for each place an upgrader can stand. First go for empty spots
        //Use the distance to each tile as a tiebreaker to handle global resets well
        //No empty spots? Assign to the oldest creep's spot
    } else if (detail.detailType == "Construction" || detail.detailType === "Repair") {
        //First prioritize with the building priority
        let comparison = BUILD_PRIORITY_COMPARATOR(
            target1.targetType as BuildableStructureConstant,
            target2.targetType as BuildableStructureConstant
        );

        //If there is a tie here and we are talking about roads, go with distance to the road instead of what comes next
        if (comparison === 0 && target1.targetType === STRUCTURE_ROAD) {
            const dist1 = workerPos.getRangeTo(unpackPos(target1.packedPosition));
            const dist2 = workerPos.getRangeTo(unpackPos(target2.packedPosition));
            comparison = dist1 - dist2;
        }

        //Next, prioritize with the progress of the buildings
        if (comparison === 0) {
            const completion1 = target1.currentProgress / target1.targetProgress;
            const completion2 = target2.currentProgress / target2.targetProgress;
            comparison = completion1 - completion2;
        }

        //Finally prioritize with the id of the structures. This makes sure that creeps target the same buildings
        if (comparison === 0) {
            comparison = target1.targetId.localeCompare(target2.targetId);
        }

        return comparison <= 0 ? target1 : target2;
    } else if (detail.detailType === "RampartRepair") {
        //Prioritize the lowest targets, easy. This will only happen during attacks, so don't worry too much about travel time
        return target1.currentProgress < target2.currentProgress ? target1 : target2;
    } else if (detail.detailType === "Reinforce") {
        //First, bucket by current progress an target progress. Also grab the linear distance for each.
        const hpBucket1 = Math.floor(target1.currentProgress / RAMPART_HP_BUCKET);
        const hpBucket2 = Math.floor(target2.currentProgress / RAMPART_HP_BUCKET);
        const distance1 = workerPos.getRangeTo(unpackPos(target1.packedPosition));
        const distance2 = workerPos.getRangeTo(unpackPos(target2.packedPosition));

        //If one is more than a bucket or two of progress, go with the lower one
        if (hpBucket1 - hpBucket2 >= PRIORITY_RAMPART_BUCKET_DIFFERENCE) return target1;
        if (hpBucket2 - hpBucket1 >= PRIORITY_RAMPART_BUCKET_DIFFERENCE) return target2;

        //If they are both in range 5, go with the lowest progress bucket one
        if (distance1 < RAMPART_PRIORITIZE_HP_DISTANCE && distance2 < RAMPART_PRIORITIZE_HP_DISTANCE)
            return hpBucket1 < hpBucket2 ? target1 : target2;

        //If we have gotten this far with a tie, go with the closest one, as they are both about the same.
        return distance1 < distance2 ? target1 : target2;
    }
    Log.e("You must have added an extra work detail type... go update `compareWorkTargets()`");
    return target1;
}

//returns true when it completes the assignment
export function _runCreep(
    creep: Creep,
    workDetail: WorkDetail,
    parentRoomName: string,
    handle: string,
    baseAnalyticsCategories: string[],
    roomData: RoomScoutingInfo
): boolean {
    let targetLock = getTargetLock(creep, workDetail);
    if (!targetLock) return true;

    let workTarget = workDetail.targets[targetLock.targetId];
    if (!workTarget) {
        Log.e(
            `Failed to look up a work target used in a target lock. This should not happen. detail type:${workDetail.detailType} detail id:${workDetail.detailId} target id:${targetLock.targetId}`
        );
    }

    let useHaulers =
        roomData.ownership?.username === global.PLAYER_USERNAME &&
        ["Claimed", "Reserved", "Economic"].includes(roomData.ownership.ownershipType ?? "Unclaimed");
    let canMine = roomData.miningInfo?.sources?.length ?? 0 > 0;
    let storage = getMainStorage(parentRoomName);

    let estimatedDrdt = 0;
    let analyticsCategories = baseAnalyticsCategories.slice();
    let done = false;
    let energySpent = 0;

    //Build and repair have an almost identical control loop. We do them the same way
    if (workDetail.detailType === "Construction" || workDetail.detailType === "Repair") {
        //If we are not close to the target or standing in a bad place, move
        let targetPos = unpackPos(workTarget.packedPosition);
        navigateToTarget(creep, targetPos, 3);

        if (Game.rooms[targetPos.roomName]) {
            let target: ConstructionSite | Structure<BuildableStructureConstant> | null = Game.getObjectById(
                targetLock.targetId
            );

            //If we do not see our target and are working on a ramp cSite, look for a new ramp on the square and target it
            if (!target && workTarget.targetType === STRUCTURE_RAMPART) {
                let builtRampart = targetPos.lookForStructure(STRUCTURE_RAMPART) as StructureRampart | undefined;
                if (builtRampart && builtRampart.hits < RAMPART_HP_BUCKET) target = builtRampart;
                else if (!builtRampart) done = true;
            }

            //If we see our target, do the thing. Build until we finish it or run out of energy.
            if (target) {
                //If we are close to the target, go ahead and work on it
                if (creep.pos.getRangeTo(targetPos) <= 3 && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                    analyticsCategories.push(ANALYTICS_CONSTRUCTION, ANALYTICS_ARTIFICER);
                    if (target instanceof ConstructionSite) {
                        estimatedDrdt = creep.getActiveBodyparts(WORK) * BUILD_POWER;
                        if (creep.build(target) === OK) energySpent = estimatedDrdt;
                        workTarget.currentProgress = target.progress;
                    } else {
                        estimatedDrdt = creep.getActiveBodyparts(WORK) * REPAIR_COST * REPAIR_POWER;
                        if (creep.repair(target) === OK) energySpent = estimatedDrdt;
                        workTarget.currentProgress = target.hits;
                    }
                }
            } else {
                done = true;
            }
        }
    }

    //If we are supposed to be upgrading, go do that too
    if (workDetail.detailType === "Upgrade") {
        let standPos = unpackPos(workTarget.packedPosition);
        navigateToTarget(creep, standPos, 0);

        if (Game.rooms[standPos.roomName]) {
            let target: StructureController | null = Game.getObjectById(targetLock.targetId);

            if (target) {
                estimatedDrdt = creep.getActiveBodyparts(WORK) * UPGRADE_CONTROLLER_POWER;
                if (creep.pos.getRangeTo(target.pos) <= 3 && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                    analyticsCategories.push(ANALYTICS_PRIEST, ANALYTICS_UPGRADE);
                    if (creep.upgradeController(target) === OK) energySpent = estimatedDrdt;
                    workTarget.currentProgress = target.progress;
                }

                //TODO do this in such a way that we never drop energy on the ground during death
                if (creep.store.getFreeCapacity(RESOURCE_ENERGY) < estimatedDrdt * 2) {
                    //If we are low energy and their is a container with E nearby, take from it.
                    let refillContainer: StructureContainer | null = creep.pos
                        .findInRange(FIND_STRUCTURES, 1)
                        .filter(s => s.structureType === STRUCTURE_CONTAINER)
                        .map(s => s as StructureContainer)?.[0];

                    if (refillContainer && refillContainer.store.getUsedCapacity(RESOURCE_ENERGY) > 3)
                        creep.withdraw(refillContainer, RESOURCE_ENERGY);
                }
            }
        }
    }

    //If we are supposed to be reinforcing, go do that
    if (workDetail.detailType === "Reinforce") {
        let targetPos = unpackPos(workTarget.packedPosition);
        navigateToTarget(creep, targetPos, 0);

        if (Game.rooms[targetPos.roomName]) {
            let target: Structure<BuildableStructureConstant> | null = Game.getObjectById(
                workTarget.targetId
            ) as Structure<BuildableStructureConstant> | null;

            if (target) {
                estimatedDrdt = creep.getActiveBodyparts(WORK) * REPAIR_COST * REPAIR_POWER;
                if (creep.pos.getRangeTo(targetPos) <= 3 && creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
                    analyticsCategories.push(ANALYTICS_REINFORCE, ANALYTICS_ARTIFICER);
                    if (creep.repair(target) === OK) energySpent = estimatedDrdt;
                    workTarget.currentProgress = target.hits;
                }
            }
        }
    }

    //If we should be doing rampart repair, go do that
    //TODO actuall do this part... probably when we need to defend or something

    //If we spent energy this tick, post an analytics event
    if (energySpent > 0) {
        postAnalyticsEvent(parentRoomName, energySpent * -1, ...analyticsCategories);
    }

    //If our current work target is finished up, find a new target/work detail
    if (workTarget.currentProgress >= workTarget.targetProgress) done = true;

    //If we don't have any energy, decide to either wait or go grab more
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        //If we are in a remote mining room or an owned room, just wait for haulers
        if (useHaulers) {
            //Just sit there and wait for a hauler
            updateNode(creep, estimatedDrdt, parentRoomName, handle, analyticsCategories);
        } else if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            if (canMine) {
                //We won't get serviced where we are. Just get the energy ourselves
                targetLock.mining = true;
                unregisterNode(parentRoomName, handle, creep.name);
            } else if (storage) {
                //We move toward the storage to go get more energy, but also register a node so that we might get topped off before we go the whole way
                targetLock.restocking = true;
                updateNode(creep, estimatedDrdt, parentRoomName, handle, analyticsCategories);
            }
        }
    }

    //If our target lock says we are mining or restocking, go do that
    if (targetLock.mining && canMine) {
        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            targetLock.mining = false;
        } else {
            //Pick a source to harvest from
            if (!targetLock.sourcePos && creep.pos.roomName === roomData.roomName) {
                let sourcePositions = roomData.miningInfo?.sources.map(s => unpackPos(s.packedPosition)) ?? [];
                let closest = minBy(sourcePositions, p => creep.pos.getRangeTo(p));
                if (closest) targetLock.sourcePos = closest;
            }

            //Harvest the source
            if (targetLock.sourcePos) {
                if (creep.pos.isNearTo(targetLock.sourcePos)) {
                    let source = creep.room.lookForAt(LOOK_SOURCES, targetLock.sourcePos);
                    if (source?.length) creep.harvest(source[0]);
                } else {
                    Traveler.travelTo(creep, targetLock.sourcePos);
                }
            } else {
                Log.e(`Creep ${creep.name} in room ${creep.room.name} is set to mine but could not find a source`);
            }
        }
    }

    // let done = false;
    // if (creep.pos.roomName !== assignment.destPosition.roomName || creep.pos.getRangeTo(assignment.destPosition) > 3) {
    //     Traveler.travelTo(creep, assignment.destPosition, { range: 3 });
    //     creep.queueSay("🚚");
    //     unregisterNode(parentRoomName, handle, creep.name);
    // } else if (assignment.detailType === "Construction" && target) {
    //     Traveler.reservePosition(creep.pos);

    //     target = target as ConstructionSite;
    //     if (target.progress <= target.progressTotal && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    //         creep.build(target);
    //         postAnalyticsEvent(
    //             parentRoomName,
    //             -1 * creep.getActiveBodyparts(WORK) * BUILD_POWER,
    //             ANALYTICS_ARTIFICER,
    //             ANALYTICS_CONSTRUCTION
    //         );
    //         creep.queueSay("🔨");
    //     } else if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    //         creep.sayWaiting();
    //     }

    //     updateNode(creep, creep.getBodyPower(WORK, "build", BUILD_POWER), parentRoomName, handle, analyticsCategories);
    // } else if (assignment.detailType === "Reinforce") {
    //     Traveler.reservePosition(creep.pos);

    //     if (assignment.currentProgress === undefined || assignment.targetProgress === undefined) {
    //         Log.e(
    //             `There is a reinfoce task without progress limits for creep:${creep.name}
    //             taks:${JSON.stringify(assignment)}`
    //         );
    //         done = true;
    //     } else if (assignment.currentProgress < assignment.targetProgress) {
    //         if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    //             creep.queueSay("🏗️");
    //             creep.repair(target as Structure);
    //             postAnalyticsEvent(
    //                 parentRoomName,
    //                 -1 * creep.getActiveBodyparts(WORK) * BUILD_POWER * REPAIR_COST,
    //                 ANALYTICS_ARTIFICER,
    //                 ANALYTICS_REPAIR
    //             );
    //         }
    //         updateNode(
    //             creep,
    //             creep.getBodyPower(WORK, "repair", REPAIR_POWER * REPAIR_COST),
    //             parentRoomName,
    //             handle,
    //             analyticsCategories
    //         );
    //     } else {
    //         done = true;
    //     }
    // } else if (assignment.detailType === "Repair") {
    //     Traveler.reservePosition(creep.pos);

    //     target = target as Structure;
    //     if (target.hits < (assignment.targetProgress ?? target.hitsMax)) {
    //         if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    //             creep.queueSay("🔧");
    //             creep.repair(target);
    //             postAnalyticsEvent(
    //                 parentRoomName,
    //                 -1 * creep.getActiveBodyparts(WORK) * BUILD_POWER * REPAIR_COST,
    //                 "Artificer"
    //             );
    //         }
    //         updateNode(
    //             creep,
    //             creep.getBodyPower(WORK, "repair", REPAIR_POWER * REPAIR_COST),
    //             parentRoomName,
    //             handle,
    //             analyticsCategories
    //         );
    //     } else {
    //         done = true;
    //         unregisterNode(parentRoomName, handle, creep.name);
    //     }
    // } else if (assignment.detailType === "Upgrade") {
    //     Traveler.reservePosition(creep.pos);

    //     target = target as StructureController;
    //     if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    //         creep.upgradeController(target);
    //         creep.queueSay("⚫");
    //         postAnalyticsEvent(
    //             parentRoomName,
    //             -1 * creep.getActiveBodyparts(WORK) * UPGRADE_CONTROLLER_POWER,
    //             ANALYTICS_ARTIFICER,
    //             ANALYTICS_UPGRADE
    //         );
    //     } else {
    //         creep.sayWaiting();
    //     }

    //     //If we are only supposed to upgrade it a certain amount, trigger the job to be done at some point
    //     if (
    //         assignment.currentProgress != undefined &&
    //         assignment.targetProgress != undefined &&
    //         assignment.currentProgress >= assignment.targetProgress
    //     ) {
    //         done = true;
    //         unregisterNode(parentRoomName, handle, creep.name);
    //     } else {
    //         updateNode(
    //             creep,
    //             creep.getBodyPower(WORK, "upgradeController", UPGRADE_CONTROLLER_POWER),
    //             parentRoomName,
    //             handle,
    //             analyticsCategories
    //         );
    //     }
    // }

    return done;
}

function navigateToTarget(creep: Creep, targetPos: RoomPosition, desiredRange: number) {
    //If we are outside the desired range, go there
    if (creep.pos.roomName !== targetPos.roomName || creep.pos.getRangeTo(targetPos) > desiredRange) {
        Traveler.travelTo(creep, targetPos);
    }

    // TODO If we are standing on an edge tile or a road, and we are inside the desired range, path to it a bit more
}

function updateNode(creep: Creep, drdt: number, parentRoomName: string, handle: string, analyticsCategories: string[]) {
    let node = getNode(parentRoomName, creep.name);
    if (node) {
        node.baseDrdt = drdt;
        node.level = creep.store.getUsedCapacity(RESOURCE_ENERGY);
        node.maxLevel = creep.store.getCapacity(RESOURCE_ENERGY);
    } else {
        let mainStoragePos = getMainStorage(parentRoomName)?.pos ?? getRallyPosition(parentRoomName);
        let pathLength = 20;
        let pathCost = 40;
        if (mainStoragePos && mainStoragePos.roomName !== parentRoomName) {
            pathLength = getMultirooomDistance(creep.pos, mainStoragePos) * 1.5;
            pathCost = pathLength * 2;
        }

        registerNode(parentRoomName, handle, {
            nodeId: creep.name,
            targetId: creep.name,
            level: creep.store.getUsedCapacity(RESOURCE_ENERGY),
            maxLevel: creep.store.getCapacity(RESOURCE_ENERGY),
            resource: RESOURCE_ENERGY,
            type: "Sink",
            analyticsCategories: analyticsCategories,
            baseDrdt: drdt,
            bodyDrdt: 1, //Reduce amount of stuff we try to create for workers. They don't add much system load
            serviceRoute: {
                pathLength: pathLength,
                pathCost: pathCost
            },
            lastKnownPosition: creep.pos
        });
    }
}
