import { getNode } from "system/hauling/HaulerInterface";
import { getRallyPosition } from "system/scouting/ScoutInterface";
import {
    getCreeps,
    maximizeBodyForTargetParts,
    registerCreepConfig,
    unregisterHandle
} from "system/spawning/SpawnInterface";
import {
    ANALYTICS_ALL,
    ANALYTICS_ARTIFICER,
    ANALYTICS_GOSS_INCOME,
    ANALYTICS_SPAWNING
} from "system/storage/AnalyticsConstants";
import { getEnergyPerTick, getMainStorage } from "system/storage/StorageInterface";
import { Log } from "utils/logger/Logger";
import { Traveler } from "utils/traveler/Traveler";
import { drawBar } from "utils/UtilityFunctions";
import {
    _constructionPriorities,
    _maintainencePriorities,
    _runCreep,
    _sortDetails,
    _upgraderPriorities
} from "./WorkerLogic";
import { deleteWorkDetail, getWorkDetails } from "./WorkInterface";

export class RoomWorkSystem {
    public roomName: string;
    private targetWorkParts: number = 0;
    private targetUpgradeParts: number = 0;

    private creepAssignments: { [creepName: string]: string } = {};

    constructor(roomName: string) {
        this.roomName = roomName;
    }

    private get handle() {
        return `Work: ${this.roomName}`;
    }

    _visualize() {
        if (Game.rooms[this.roomName]) {
            Object.values(getWorkDetails(this.roomName)).forEach(detail => {
                new RoomVisual(detail.destPosition.roomName).rect(
                    detail.destPosition.x - 0.5,
                    detail.destPosition.y - 0.5,
                    1,
                    1,
                    {
                        fill: "transparent",
                        stroke: "yellow"
                    }
                );
            });

            let numWork = _.sum(getCreeps(this.handle), c => _.sum(c.body, p => (p.type === WORK ? 1 : 0)));
            drawBar(
                `WorkerParts: ${numWork}/${this.targetWorkParts}`,
                2,
                numWork / this.targetWorkParts,
                Game.rooms[this.roomName].visual
            );
        }
    }

    _runCreeps() {
        let details: { [id: string]: WorkDetail } = getWorkDetails(this.roomName);
        let creeps = getCreeps(this.handle);
        let first = true;
        for (let creep of creeps) {
            let assignment: WorkDetail | undefined = this.creepAssignments[creep.name]
                ? details[this.creepAssignments[creep.name]]
                : undefined;
            if (!assignment) {
                //TODO give them an assignment
            }

            if (assignment) {
                let results = _runCreep(creep, assignment, this.roomName, this.handle, [this.handle]);
                if (results) {
                    delete this.creepAssignments[creep.name];
                    deleteWorkDetail(this.roomName, assignment.detailId);
                }
            } else {
                let rally = getRallyPosition(this.roomName);
                if (rally) Traveler.travelTo(creep, rally);
                creep.sayWaiting();
            }

            first = false;
        }
    }

    _reloadConfigs() {
        let details = Object.values(getWorkDetails(this.roomName));

        let hasBuild: boolean = false;
        let hasUpgrade: boolean = false;
        for (let d of details) {
            if (d.detailType === "Upgrade") hasUpgrade = true;
            else hasBuild = true;
            if (hasBuild && hasUpgrade) break;
        }

        if (details.length > 0) {
            let configs: CreepConfig[] = [];

            //Net energy not counting workers
            let availableEnergy =
                getEnergyPerTick(this.roomName, ANALYTICS_GOSS_INCOME) +
                getEnergyPerTick(this.roomName, ANALYTICS_SPAWNING) -
                getEnergyPerTick(this.roomName, ANALYTICS_ARTIFICER);

            let storage = getMainStorage(this.roomName);
            if (
                storage &&
                storage instanceof StructureStorage &&
                storage.store.getUsedCapacity(RESOURCE_ENERGY) > 50000
            ) {
                availableEnergy *= 2;
            }

            //TODO We have to allocate our energy amongst the different creep configs we register.
            //TODO We will have build/repairers which are optimized for moving at decent speed and have high energy cap
            //TODO We will also have builders which won't care much for moving or storage, optimizing for work parts

            // Log.d(`Available energy: ${availableEnergy}`);
            //If we are netting low, only make a single dude to maintain things
            if (availableEnergy < 0) {
                if (hasBuild) {
                    configs.push({
                        handle: this.handle,
                        subHandle: "Artificer",
                        body: [WORK, CARRY, CARRY, MOVE, MOVE],
                        jobName: "Artificer",
                        quantity: 1
                    });
                    this.targetWorkParts = 1;
                }

                if (hasUpgrade) {
                    configs.push({
                        handle: this.handle,
                        subHandle: "Priest",
                        body: [WORK, CARRY, CARRY, CARRY, MOVE],
                        jobName: "Priest",
                        quantity: 1
                    });
                    this.targetUpgradeParts = 1;
                }
            } else {
                let configs: CreepConfig[] = [];
                let buildEnergy = 0;
                let upgradeEnergy = 0;

                //Split the energy across the two
                if (hasBuild && hasUpgrade) {
                    buildEnergy = availableEnergy / 2;
                    upgradeEnergy = availableEnergy - buildEnergy;
                }
                //Otherwise focus on one or the other
                else if (hasBuild) {
                    buildEnergy = availableEnergy;
                } else {
                    upgradeEnergy = availableEnergy;
                }

                this.targetWorkParts = Math.ceil(buildEnergy / UPGRADE_CONTROLLER_POWER);
                this.targetUpgradeParts = Math.ceil(availableEnergy / UPGRADE_CONTROLLER_POWER);

                if (this.targetWorkParts > 0) {
                    let bodies = maximizeBodyForTargetParts(
                        [WORK, CARRY, CARRY, CARRY, MOVE],
                        [WORK, CARRY, MOVE],
                        WORK,
                        this.targetWorkParts,
                        Game.rooms[this.roomName]!.energyCapacityAvailable
                    );
                    for (let i = 0; i < bodies.length; i++) {
                        configs.push({
                            handle: this.handle,
                            subHandle: "Artificer:" + i,
                            body: bodies[i],
                            jobName: "Artificer",
                            quantity: 1
                        });
                    }
                }

                if (this.targetUpgradeParts > 0) {
                    let bodies = maximizeBodyForTargetParts(
                        [WORK, WORK, CARRY, MOVE],
                        [WORK, WORK, CARRY, MOVE],
                        WORK,
                        this.targetWorkParts,
                        Game.rooms[this.roomName]!.energyCapacityAvailable
                    );
                    for (let i = 0; i < bodies.length; i++) {
                        configs.push({
                            handle: this.handle,
                            subHandle: "Priest:" + i,
                            body: bodies[i],
                            jobName: "Priest",
                            quantity: 1
                        });
                    }
                }
            }
            registerCreepConfig(this.handle, configs, this.roomName);
        } else {
            unregisterHandle(this.handle);
        }
    }
}
