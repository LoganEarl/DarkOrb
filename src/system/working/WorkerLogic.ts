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
import { getMultirooomDistance } from "utils/UtilityFunctions";

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

const PRIORITY_COMPARITOR = (a: BuildableStructureConstant, b: BuildableStructureConstant) => {
    let aIndex = CONSTRUCTION_PRIORITIES.indexOf(a);
    let bIndex = CONSTRUCTION_PRIORITIES.indexOf(b);
    if (aIndex === -1) aIndex = CONSTRUCTION_PRIORITIES.length;
    if (bIndex === -1) bIndex = CONSTRUCTION_PRIORITIES.length;
    return aIndex - bIndex;
};

export interface UpgradeAssignment {
    placeToStand: RoomPosition;
}

export function _assignUpgradeJob(creep: string, assignmnets: UpgradeAssignment[], upgradePlaces: RoomPosition[]) {
    //TODO we have the data in the room plan for all the positions upgraders stand. Use that to assign a spot
    //TODO splice out dead assignments
}

export function _runUpgrader(
    creep: Creep,
    assignment: WorkDetail,
    parentRoomName: string,
    upgradeContainer: StructureContainer | undefined,
    //TODO upgrader assignment has to have a spot to stand
    handle: string,
    analyticsCategories: string[]
): boolean {
    //go to the controller upgrade point. Need to pick one for scouting...
    //Basically, it needs to be the point with the most free spaces next to it within range 3 of the controller

    return false;
}

export function _runWorker(
    creep: Creep,
    assignment: WorkDetail,
    parentRoomName: string,
    handle: string,
    analyticsCategories: string[]
): boolean {
    //TODO We have a general work detail. This needs to be smart enough to target lock and complete tasks in the room
    //TODO should we use creep memory for the target lock or just go with heap? probably just heap. We can scrub it for bad targets periodically.

    return false;
}

//returns true when it completes the assignment
export function _runCreep(
    creep: Creep,
    assignment: WorkDetail,
    parentRoomName: string,
    handle: string,
    analyticsCategories: string[]
): boolean {
    let target;
    if (creep.pos.roomName === assignment.destPosition.roomName) {
        target = Game.getObjectById(assignment.targetId);
        if (!target) {
            creep.queueSay("✅");
            return true;
        }
    }

    let done = false;
    if (creep.pos.roomName !== assignment.destPosition.roomName || creep.pos.getRangeTo(assignment.destPosition) > 3) {
        Traveler.travelTo(creep, assignment.destPosition, { range: 3 });
        creep.queueSay("🚚");
        unregisterNode(parentRoomName, handle, creep.name);
    } else if (assignment.detailType === "Construction" && target) {
        Traveler.reservePosition(creep.pos);

        target = target as ConstructionSite;
        if (target.progress <= target.progressTotal && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            creep.build(target);
            postAnalyticsEvent(
                parentRoomName,
                -1 * creep.getActiveBodyparts(WORK) * BUILD_POWER,
                ANALYTICS_ARTIFICER,
                ANALYTICS_CONSTRUCTION
            );
            creep.queueSay("🔨");
        } else if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            creep.sayWaiting();
        }

        updateNode(creep, creep.getBodyPower(WORK, "build", BUILD_POWER), parentRoomName, handle, analyticsCategories);
    } else if (assignment.detailType === "Reinforce") {
        Traveler.reservePosition(creep.pos);

        if (assignment.currentProgress === undefined || assignment.targetProgress === undefined) {
            Log.e(
                `There is a reinfoce task without progress limits for creep:${creep.name} 
                taks:${JSON.stringify(assignment)}`
            );
            done = true;
        } else if (assignment.currentProgress < assignment.targetProgress) {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                creep.queueSay("🏗️");
                creep.repair(target as Structure);
                postAnalyticsEvent(
                    parentRoomName,
                    -1 * creep.getActiveBodyparts(WORK) * BUILD_POWER * REPAIR_COST,
                    ANALYTICS_ARTIFICER,
                    ANALYTICS_REPAIR
                );
            }
            updateNode(
                creep,
                creep.getBodyPower(WORK, "repair", REPAIR_POWER * REPAIR_COST),
                parentRoomName,
                handle,
                analyticsCategories
            );
        } else {
            done = true;
        }
    } else if (assignment.detailType === "Repair") {
        Traveler.reservePosition(creep.pos);

        target = target as Structure;
        if (target.hits < (assignment.targetProgress ?? target.hitsMax)) {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                creep.queueSay("🔧");
                creep.repair(target);
                postAnalyticsEvent(
                    parentRoomName,
                    -1 * creep.getActiveBodyparts(WORK) * BUILD_POWER * REPAIR_COST,
                    "Artificer"
                );
            }
            updateNode(
                creep,
                creep.getBodyPower(WORK, "repair", REPAIR_POWER * REPAIR_COST),
                parentRoomName,
                handle,
                analyticsCategories
            );
        } else {
            done = true;
            unregisterNode(parentRoomName, handle, creep.name);
        }
    } else if (assignment.detailType === "Upgrade") {
        Traveler.reservePosition(creep.pos);

        target = target as StructureController;
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            creep.upgradeController(target);
            creep.queueSay("⚫");
            postAnalyticsEvent(
                parentRoomName,
                -1 * creep.getActiveBodyparts(WORK) * UPGRADE_CONTROLLER_POWER,
                ANALYTICS_ARTIFICER,
                ANALYTICS_UPGRADE
            );
        } else {
            creep.sayWaiting();
        }

        //If we are only supposed to upgrade it a certain amount, trigger the job to be done at some point
        if (
            assignment.currentProgress != undefined &&
            assignment.targetProgress != undefined &&
            assignment.currentProgress >= assignment.targetProgress
        ) {
            done = true;
            unregisterNode(parentRoomName, handle, creep.name);
        } else {
            updateNode(
                creep,
                creep.getBodyPower(WORK, "upgradeController", UPGRADE_CONTROLLER_POWER),
                parentRoomName,
                handle,
                analyticsCategories
            );
        }
    }

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
