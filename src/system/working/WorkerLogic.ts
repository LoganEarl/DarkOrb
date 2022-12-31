import { detect } from "lodash";
import { getNode, registerNode, unregisterNode } from "system/hauling/HaulerInterface";
import { getRallyPosition } from "system/scouting/ScoutInterface";
import {
    ANALYTICS_ARTIFICER,
    ANALYTICS_CONSTRUCTION,
    ANALYTICS_REPAIR,
    ANALYTICS_UPGRADE
} from "system/storage/AnalyticsConstants";
import { getMainStorage, postAnalyticsEvent } from "system/storage/StorageInterface";
import { Log } from "utils/logger/Logger";
import { Traveler } from "utils/traveler/Traveler";
import { getMultirooomDistance, insertSorted } from "utils/UtilityFunctions";

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
        //If there is a tie here and we are talking about roads, go with distance to the road instead of what comes next
        //Next, prioritize with the progress of the buildings
        //Finally prioritize with the id of the structures. This makes sure that creeps target the same buildings
    } else if (detail.detailType === "RampartRepair") {
        //Prioritize the lowest targets, easy. This will only happen during attacks, so don't worry too much about travel time
    } else if (detail.detailType === "Reinforce") {
        //First, bucket by current progress an target progress. Also grab the linear distance for each.
        //If one is more than a bucket or two of progress, go with the lower one
        //If they are both in range 5, go with the lowest progress bucket one
        //If we have gotten this far with a tie, go with the closest one, as they are both about the same.
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
    analyticsCategories: string[]
): boolean {
    let targetLock = getTargetLock(creep, workDetail);

    //If we don't have any energy, decide to either wait or go grab more
    //If we are in a remote mining room or an owned room, just wait for haulers
    //Otherwise, toggle our target lock's mining or restocking field to true

    //If our target lock says we are mining or restocking, go do that

    //If we are supposed to be building, go build
    //If we do not see our target and are working on a ramp cSite, look for a new ramp on the square and target it
    //If we see our target, do the thing. Build until we finish it or run out of energy.

    //If we are supposed to be upgrading, go do that too
    //If we are low energy and their is a container with E nearby, take from it.

    //If we are supposed to be reinforcing, go do that

    //If we should be repairing, go do that

    //If we should be doing rampart repair, go do that

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
