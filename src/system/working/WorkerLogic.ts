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

interface SortedDetails {
    controllerDetail?: WorkDetail;
    lowControllerDetail?: WorkDetail;
    rampartRepair?: WorkDetail;
    rampartReinforcement?: WorkDetail;
    roadRepair?: WorkDetail;
    miscRepair?: WorkDetail;
    build?: WorkDetail;
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
            Traveler.reservePosition(creep.pos);
        } else if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            creep.sayWaiting();
        }

        updateNode(creep, creep.getBodyPower(WORK, "build", BUILD_POWER), parentRoomName, handle, analyticsCategories);
    } else if (assignment.detailType === "Reinforce") {
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
                Traveler.reservePosition(creep.pos);
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
        target = target as Structure;
        if (target.hits < target.hitsMax || (target.structureType === STRUCTURE_RAMPART && target.hits < 20000)) {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                creep.queueSay("🔧");
                creep.repair(target);
                postAnalyticsEvent(
                    parentRoomName,
                    -1 * creep.getActiveBodyparts(WORK) * BUILD_POWER * REPAIR_COST,
                    "Artificer"
                );
                Traveler.reservePosition(creep.pos);
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
        target = target as StructureController;

        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            creep.upgradeController(target);
            creep.queueSay("⚫");
            Traveler.reservePosition(creep.pos);
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

export function _constructionPriorities(sortedDetails: SortedDetails): WorkDetail | undefined {
    return sortedDetails.rampartRepair ?? sortedDetails.build ?? sortedDetails.rampartReinforcement;
}

export function _upgraderPriorities(sortedDetails: SortedDetails): WorkDetail | undefined {
    return sortedDetails.controllerDetail;
}

export function _maintainencePriorities(sortedDetails: SortedDetails): WorkDetail | undefined {
    return (
        sortedDetails.lowControllerDetail ??
        sortedDetails.rampartRepair ??
        sortedDetails.roadRepair ??
        sortedDetails.miscRepair ??
        sortedDetails.build
    );
}

export function _sortDetails(creep: Creep, details: WorkDetail[]): SortedDetails {
    let results: SortedDetails = {};

    for (let detail of details) {
        //upgrade controller if it is about to downgrade
        if (detail.detailType === "Upgrade" && detail.targetStructureType === STRUCTURE_CONTROLLER) {
            //In maintainence mode, only upgrade the controller if it is close to downgrading
            let downgradeTicks = Game.rooms[detail.destPosition.roomName]?.controller?.ticksToDowngrade;
            if (downgradeTicks && downgradeTicks < 20000) {
                results.lowControllerDetail = detail;
            }

            results.controllerDetail = detail;
        }

        //repair ramparts that are low.
        else if (detail.targetStructureType === STRUCTURE_RAMPART && detail.detailType === "Repair") {
            if (
                detail.currentProgress != undefined &&
                detail.targetProgress != undefined &&
                detail.currentProgress < (results.rampartRepair?.currentProgress ?? Infinity)
            ) {
                results.rampartRepair = detail;
            }
        }

        //repair roads that are low.
        else if (detail.detailType === "Repair") {
            //Just go with the closest one. Treat roads seperatly
            if (
                detail.targetStructureType === STRUCTURE_ROAD &&
                (!results.roadRepair ||
                    getMultirooomDistance(creep.pos, detail.destPosition) <
                        getMultirooomDistance(creep.pos, results.roadRepair.destPosition))
            ) {
                results.roadRepair = detail;
            } else if (
                !results.miscRepair ||
                getMultirooomDistance(creep.pos, detail.destPosition) <
                    getMultirooomDistance(creep.pos, results.miscRepair.destPosition)
            ) {
                results.miscRepair = detail;
            }
        }

        //build new structures
        else if (detail.detailType === "Construction") {
            if (results.build) {
                let comparison = PRIORITY_COMPARITOR(
                    detail.targetStructureType! as BuildableStructureConstant,
                    results.build.targetStructureType as BuildableStructureConstant
                );

                //Take the higher progress in the event of a tie
                if (comparison === 0)
                    comparison = (detail.currentProgress ?? 0) > (results.build.currentProgress ?? 0) ? -1 : 1;
                if (comparison < 0) results.build = detail;
            } else results.build = detail;
        }

        //Make the walls higher. Go with the one with the lowest current progress
        else if (detail.detailType === "Reinforce") {
            if (results.rampartReinforcement) {
                if ((results.rampartReinforcement.currentProgress ?? Infinity) < (detail.currentProgress ?? 0))
                    results.rampartReinforcement = detail;
            } else results.rampartReinforcement = detail;
        }
    }
    return results;
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
