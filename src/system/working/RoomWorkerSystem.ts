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
import { deleteWorkDetail, getWorkDetails } from "./WorkInterface";
import { _assignWorkDetail } from "./WorkerLogic";

export class RoomWorkSystem {
    public roomName: string;
    //Creep name to work detail id
    private creepAssignments: Map<string, string> = new Map();

    constructor(roomName: string) {
        this.roomName = roomName;
    }

    private get upgradeHandle() {
        return `Upgrade: ${this.roomName}`;
    }

    private get workHandle() {
        return `Work: ${this.roomName}`;
    }

    private get eRepairHandle() {
        return `ERepair: ${this.roomName}`;
    }

    _visualize() {
        // if (Game.rooms[this.roomName]) {
        //     Object.values(getWorkDetails(this.roomName)).forEach(detail => {
        //         new RoomVisual(detail.destPosition.roomName).rect(
        //             detail.destPosition.x - 0.5,
        //             detail.destPosition.y - 0.5,
        //             1,
        //             1,
        //             {
        //                 fill: "transparent",
        //                 stroke: "yellow"
        //             }
        //         );
        //     });
        //     let numWork = _.sum(getCreeps(this.handle), c => _.sum(c.body, p => (p.type === WORK ? 1 : 0)));
        //     drawBar(
        //         `WorkerParts: ${numWork}/${this.targetWorkParts}`,
        //         2,
        //         numWork / this.targetWorkParts,
        //         Game.rooms[this.roomName].visual
        //     );
        // }
    }

    _runCreeps() {
        let details: { [id: string]: WorkDetail } = getWorkDetails(this.roomName);

        this.runCreepPool("Upgraders", this.upgradeHandle, details);
        this.runCreepPool("Workers", this.workHandle, details);
        this.runCreepPool("EmergencyRepairers", this.eRepairHandle, details);
    }

    private runCreepPool(pool: WorkerPool, handle: string, workDetails: { [id: string]: WorkDetail }) {
        let workers = getCreeps(handle);
        for (let creep of workers) {
            let assignment: WorkDetail | undefined = this.creepAssignments.get(creep.name)
                ? workDetails[this.creepAssignments.get(creep.name)!]
                : undefined;
            if (!assignment) assignment = _assignWorkDetail(creep, pool, Object.values(workDetails));
            if (assignment) {
                this.creepAssignments.set(creep.name, assignment.detailId);
                //TODO do the thing
            }
        }
    }

    _reloadConfigs() {
        let details = Object.values(getWorkDetails(this.roomName));
        //There are several types of worker pool. We need to figure out how much
        // e/t to devote to each

        if (details.length === 0) {
            //If there aren't any details just keep a single upgrader around
            registerCreepConfig(
                this.upgradeHandle,
                [
                    {
                        handle: this.upgradeHandle,
                        subHandle: "Priest",
                        body: [WORK, CARRY, CARRY, CARRY, MOVE],
                        jobName: "Priest",
                        quantity: 1
                    }
                ],
                this.roomName
            );
            return;
        }

        let availableEnergy =
            getEnergyPerTick(this.roomName, ANALYTICS_GOSS_INCOME) +
            getEnergyPerTick(this.roomName, ANALYTICS_SPAWNING) -
            getEnergyPerTick(this.roomName, ANALYTICS_ARTIFICER);

        //TODO temporary measure to burn off excesses
        let storage = getMainStorage(this.roomName);
        let highCapacity = (storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 50000;
        if (highCapacity) {
            availableEnergy *= 2;
        }

        let energyBudgetPerWorkerPool: Map<WorkerPool, number> = new Map();
        for (let detail of details) {
            //First just signal that this pool is needed
            energyBudgetPerWorkerPool.set(detail.primaryPool, 1);
        }
        //TODO this is super crude. Eventually we will want more granular control over energy distribution per rcl
        //Next scale each pool to match the desired ratio (for now, just even distribution)
        let numActivePools = energyBudgetPerWorkerPool.size;
        if (energyBudgetPerWorkerPool.get("EmergencyRepairers")) {
            //0 out the other categories
            for (let pool of energyBudgetPerWorkerPool.keys()) energyBudgetPerWorkerPool.set(pool, 0);
            //Give repair all we got
            let eRepairEnergy = availableEnergy * 2; //For a total of x4 in emergencies
            energyBudgetPerWorkerPool.set("EmergencyRepairers", eRepairEnergy);
        } else {
            //Split the energy amongst the pools
            for (let pool of energyBudgetPerWorkerPool.keys()) {
                //Minimum of 1e/t
                energyBudgetPerWorkerPool.set(pool, Math.min(Math.floor(availableEnergy / numActivePools), 1));
            }
        }

        //If we need workers, queue them up
        let workEnergy = energyBudgetPerWorkerPool.get("Workers");
        if (workEnergy) {
            let targetWorkParts = Math.ceil(workEnergy / BUILD_POWER);
            //TODO make a new version of this that makes all the creeps the same size
            let bodies = maximizeBodyForTargetParts(
                [WORK, CARRY, CARRY, MOVE, MOVE],
                [WORK, CARRY, CARRY, MOVE, MOVE],
                WORK,
                targetWorkParts,
                Game.rooms[this.roomName]!.energyCapacityAvailable
            );
            let configs: CreepConfig[] = [];
            for (let i = 0; i < bodies.length; i++) {
                configs.push({
                    handle: this.workHandle,
                    subHandle: "Artificer:" + i,
                    body: bodies[i],
                    jobName: "Artificer",
                    quantity: 1
                });
            }
            registerCreepConfig(this.workHandle, configs, this.roomName);
        } else {
            unregisterHandle(this.workHandle);
        }

        let upgradeEnergy = energyBudgetPerWorkerPool.get("Upgraders");
        if (upgradeEnergy) {
            let targetWorkParts = Math.ceil(upgradeEnergy / UPGRADE_CONTROLLER_POWER);
            let bodies = maximizeBodyForTargetParts(
                [WORK, WORK, CARRY, MOVE],
                [WORK, WORK, MOVE],
                WORK,
                targetWorkParts,
                Game.rooms[this.roomName].energyAvailable
            );
            let configs: CreepConfig[] = [];
            for (let i = 0; i < bodies.length; i++) {
                configs.push({
                    handle: this.upgradeHandle,
                    subHandle: "Priest:" + 1,
                    body: bodies[i],
                    jobName: "Priest",
                    quantity: 1
                });
            }
        }

        //TODO emergency builders would go here. Need to figure out boosts before I mess with that...
    }
}
