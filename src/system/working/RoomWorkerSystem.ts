import {getRoomData} from "system/scouting/ScoutInterface";
import {
    getCreeps,
    maximizeBodyForTargetParts,
    registerCreepConfig,
    unregisterHandle
} from "system/spawning/SpawnInterface";
import {
    ANALYTICS_ARTIFICER,
    ANALYTICS_GOSS_INCOME,
    ANALYTICS_SPAWNING
} from "system/storage/AnalyticsConstants";
import {getEnergyPerTick, getMainStorage} from "system/storage/StorageInterface";
import {getWorkDetails} from "./WorkInterface";
import {workerLogic} from "./WorkerLogic";
import {findStructure} from "../../utils/StructureFindCache";
import {drawBar, roomPos} from "../../utils/UtilityFunctions";
import {unpackPos} from "../../utils/Packrat";
import {getNode, registerNode} from "../hauling/HaulerInterface";
import {Traveler} from "../../utils/traveler/Traveler";

export class RoomWorkSystem {
    public roomName: string;
    //Creep name to work detail id
    private creepAssignments: Map<string, string> = new Map();
    private targetWorkParts: number = 0;
    private targetUpgradeParts: number = 0;

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
        if (Game.rooms[this.roomName]) {
            Object.values(getWorkDetails(this.roomName)).forEach(detail => {
                Object.values(detail.targets).forEach(target => {
                    let destPosition = unpackPos(target.packedPosition)
                    new RoomVisual(destPosition.roomName).rect(
                        destPosition.x - 0.5,
                        destPosition.y - 0.5,
                        1,
                        1,
                        {
                            fill: "transparent",
                            stroke: "yellow"
                        }
                    );
                })
            });
            let numWork = _.sum(getCreeps(this.workHandle), c => _.sum(c.body, p => (p.type === WORK ? 1 : 0)));
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

        this.runCreepPool("Upgraders", this.upgradeHandle, details);
        this.runCreepPool("Workers", this.workHandle, details);
        this.runCreepPool("EmergencyRepairers", this.eRepairHandle, details);
        this.updateUpgraderContainerNode();
    }

    private runCreepPool(pool: WorkerPool, handle: string, workDetails: {
        [id: string]: WorkDetail
    }) {
        let workers = getCreeps(handle);
        for (let creep of workers) {
            let assignment: WorkDetail | undefined = this.creepAssignments.get(creep.name)
                ? workDetails[this.creepAssignments.get(creep.name)!]
                : undefined;
            if (!assignment) assignment = workerLogic._assignWorkDetail(creep, pool, workDetails, this.creepAssignments);
            if (assignment) {
                this.creepAssignments.set(creep.name, assignment.detailId);
                let finished = workerLogic._runCreep(creep, assignment, this.roomName, handle, [], getRoomData(creep.pos.roomName)!)
                if (finished) {
                    this.creepAssignments.delete(creep.name);
                }
            }
        }
    }

    private updateUpgraderContainerNode() {
        let mapData = getRoomData(this.roomName);
        if (mapData?.roomPlan?.upgradeContainerPos) {
            let containerPos = roomPos(mapData!.roomPlan!.upgradeContainerPos!, this.roomName);
            let upgradeContainer = findStructure(Game.rooms[this.roomName], FIND_STRUCTURES)
                .find(s => s instanceof StructureContainer &&
                    s.pos.getRangeTo(containerPos) === 0) as StructureContainer | undefined
            if (upgradeContainer) {
                let existingNode = getNode(this.roomName, "UpgradeContainer")
                //The mod thing makes sure we re-measure the path cost every once in a while
                if(existingNode && Game.time % 150 != 43) {
                    existingNode.level = upgradeContainer.store.getUsedCapacity(RESOURCE_ENERGY)
                    existingNode.baseDrdt = this.targetUpgradeParts * UPGRADE_CONTROLLER_POWER
                } else {
                    let pathCost = 40;
                    let pathLength = 20;
                    let storage = getMainStorage(this.roomName)
                    if(storage) {
                        let pathInfo = Traveler.findTravelPath(storage, Game.rooms[this.roomName].controller!, {
                            plainCost: 2,
                            range: 1,
                            ignoreRoads: false,
                            ignoreStructures: false
                        });
                        pathCost = pathInfo.cost;
                        pathLength = pathInfo.path.length
                    }

                    registerNode(this.roomName, this.upgradeHandle, {
                        analyticsCategories: [],
                        baseDrdt: this.targetUpgradeParts * UPGRADE_CONTROLLER_POWER,
                        lastKnownPosition: upgradeContainer.pos,
                        level: upgradeContainer.store.getUsedCapacity(RESOURCE_ENERGY),
                        maxLevel: upgradeContainer.store.getCapacity(RESOURCE_ENERGY),
                        nodeId: "UpgradeContainer",
                        resource: RESOURCE_ENERGY,
                        serviceRoute: {pathCost: pathCost, pathLength: pathLength},
                        targetId: upgradeContainer.id,
                        type: "Sink"
                    })
                }
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
        let maxUpgraders = 0;
        for (let detail of details) {
            //First just signal that this pool is needed
            energyBudgetPerWorkerPool.set(detail.primaryPool, 1);
            if (detail.primaryPool === "Upgraders") {
                maxUpgraders += detail.maxCreeps;
            }
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
                let energy = Math.max(Math.floor(availableEnergy / numActivePools), 1);
                energyBudgetPerWorkerPool.set(pool, energy);
            }
        }

        //If we need workers, queue them up
        let workEnergy = energyBudgetPerWorkerPool.get("Workers");
        if (workEnergy) {
            this.targetWorkParts = Math.ceil(workEnergy / BUILD_POWER);
            //TODO make a new version of this that makes all the creeps the same size
            let bodies = maximizeBodyForTargetParts(
                [WORK, CARRY, CARRY, MOVE, MOVE],
                [WORK, CARRY, CARRY, MOVE, MOVE],
                WORK,
                this.targetWorkParts,
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
            this.targetUpgradeParts = Math.ceil(upgradeEnergy / UPGRADE_CONTROLLER_POWER);
            let bodies = maximizeBodyForTargetParts(
                [WORK, WORK, CARRY, MOVE],
                [WORK, WORK, MOVE],
                WORK,
                this.targetUpgradeParts,
                Game.rooms[this.roomName].energyAvailable
            );
            let configs: CreepConfig[] = [];
            for (let i = 0; i < bodies.length && i < maxUpgraders; i++) {
                configs.push({
                    handle: this.upgradeHandle,
                    subHandle: "Priest:" + i,
                    body: bodies[i],
                    jobName: "Priest",
                    quantity: 1,
                    dontPrespawnParts: true //We do this because there is limited space available.
                });
            }
            registerCreepConfig(this.upgradeHandle, configs, this.roomName);
        } else {
            unregisterHandle(this.upgradeHandle);
        }

        //TODO emergency builders would go here. Need to figure out boosts before I mess with that...
    }
}
