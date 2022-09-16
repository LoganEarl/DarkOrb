import { getNode, registerNode, unregisterNode, unregisterNodes } from "system/hauling/HaulerInterface";
import { getMapData } from "system/scouting/ScoutInterface";
import { getCreeps, registerCreepConfig, unregisterHandle } from "system/spawning/SpawnInterface";
import { getMainStorage } from "system/storage/StorageInterface";
import { Log } from "utils/logger/Logger";
import { MemoryComponent, memoryWriter } from "utils/MemoryWriter";
import { packPos, unpackPos, unpackPosList } from "utils/Packrat";
import { Traveler } from "utils/traveler/Traveler";
import { getMultirooomDistance, samePos } from "utils/UtilityFunctions";
import {
    _assignMiningSpace,
    _designCreepsForMineral,
    _designCreepsForSource,
    _findPathToFreeSpace,
    _runSourceMiner
} from "./MinerLogic";

/*
    We don't want to do too much here. Calcuate the mining path, figure out our creep configs, and know how to run the logic
*/
export class SourceMinerSystem implements MemoryComponent {
    roomName: string;

    private memory?: SourceMinerMemory;
    private parentRoomName: string;
    private sourceId: Id<Source | Mineral>;
    private isSource: boolean;
    private freeSpaces: RoomPosition[] = [];
    private creepAssignments: { [creepName: string]: MinerAssignment } = {};
    private configs: CreepConfig[] = [];

    public targetWorkParts: number = 0;

    public get currentParts(): number {
        return _.sum(getCreeps(this.handle), c => c.getActiveBodyparts(WORK));
    }

    get handle() {
        return `Mining:${this.parentRoomName}->${this.roomName}:${this.sourceId.substring(this.sourceId.length - 6)}`;
    }

    constructor(sourceId: Id<Source | Mineral>, isSource: boolean, roomName: string, parentRoomName: string) {
        this.sourceId = sourceId;
        this.roomName = roomName;
        this.parentRoomName = parentRoomName;
        this.isSource = isSource;

        this.loadFreeSpaces();
        this.loadMemory();
    }

    _visualize() {
        this.loadMemory();
        if (this.freeSpaces.length) {
            let mainStorage = getMainStorage(this.parentRoomName);
            if (mainStorage) {
                let state = this.memory!.state;
                let color = "#ffffff";
                if (state === "Active") color = "#00ff44";
                else if (state === "Stopped") color = "#ff0044";
                Game.map.visual.line(mainStorage.pos, this.freeSpaces[0], { color: color });
            }
        }
    }

    get pathLength() {
        this.loadMemory();
        return this.memory!.pathLength;
    }

    private loadFreeSpaces(): void {
        //Does not require room memory for a reason!!
        let roomData = getMapData(this.roomName);
        if (this.isSource && roomData?.miningInfo) {
            let ourSourceData = _.find(roomData!.miningInfo!.sources, s => s.id == (this.sourceId as string));
            if (ourSourceData) {
                this.freeSpaces = unpackPosList(ourSourceData.packedFreeSpots);
                this.clearStopReason("NoMapData");
            } else {
                Log.e(
                    `Failed to find source data for id:${this.sourceId} in room:${this.roomName} for parent:${this.parentRoomName}`
                );
                this.addStopReason("NoMapData");
            }
        } else if (!this.isSource && roomData?.miningInfo) {
            this.freeSpaces = unpackPosList(roomData.miningInfo.mineral.packedFreeSpots);
            this.clearStopReason("NoMapData");
        } else {
            Log.e(
                `Failed to load source miner system for source:${this.sourceId} room:${this.roomName}, missing scouting data`
            );
            this.addStopReason("NoMapData");
        }
    }

    //Reloads our pathCost and pathLength fields. Also detects when the mining path becomes blocked off
    _reloadPathInfo() {
        this.loadMemory();
        let mainStorage = getMainStorage(this.parentRoomName);
        if (mainStorage) {
            this.loadFreeSpaces();
            let path: PathFinderPath | undefined = _findPathToFreeSpace(this.freeSpaces, mainStorage.pos);
            if (path) {
                this.clearStopReason("PathBlocked");
                this.memory!.pathCost = path.cost;
                this.memory!.pathLength = path.path.length;
            } else {
                this.addStopReason("PathBlocked");
            }
        }
    }

    _reloadConfigs(makeStarterCreep: boolean) {
        this.loadMemory();

        let parentRoom = Game.rooms[this.parentRoomName];
        if (parentRoom) {
            this.clearStopReason("NoHomeRoom");
        } else {
            this.addStopReason("NoHomeRoom");
        }

        //Determine if we own the room
        let mapData: RoomScoutingInfo | undefined = getMapData(this.roomName);
        if (mapData?.ownership && mapData.ownership.username !== global.PLAYER_USERNAME) {
            if (mapData.ownership.ownershipType === "Claimed") this.addStopReason("ForeignOwnership");
            else this.clearStopReason("ForeignOwnership");

            if (mapData.ownership.ownershipType === "Reserved") this.addStopReason("ForeignReservation");
            else this.clearStopReason("ForeignReservation");
        }

        let handle = this.handle;
        if (this.memory!.state !== "Active") {
            //When we aren't active we prevent additional creep spawns. We DONT stop running though.
            unregisterHandle(handle, this.parentRoomName);
            this.targetWorkParts = 0;
        } else {
            if (mapData) {
                this.clearStopReason("NoMapData");
                if (this.isSource) {
                    this.configs = _designCreepsForSource(
                        handle,
                        this.freeSpaces.length,
                        parentRoom,
                        this.memory!.pathLength,
                        mapData,
                        this.pathLength
                    );
                    if (makeStarterCreep && getCreeps(handle).length === 0) {
                        this.configs.push({
                            body: [WORK, MOVE],
                            handle: handle,
                            subHandle: "StarterMiner",
                            jobName: "Primordial",
                            quantity: 1,
                            subPriority: 0 //Make this spawn before all others, including the hauler
                        });
                    }
                } else {
                    this.configs = [
                        _designCreepsForMineral(handle, this.freeSpaces.length, parentRoom, this.memory!.pathLength)
                    ];
                }
                this.targetWorkParts = _.sum(this.configs, c => _.sum(c.body, p => (p === WORK ? 1 : 0)));
                registerCreepConfig(handle, this.configs, this.parentRoomName);
            } else {
                this.addStopReason("NoMapData");
            }
        }
    }

    _start() {
        this.loadMemory();
        if (this.memory!.state === "New") {
            Log.i(`Started mining operation ${this.parentRoomName}->${this.roomName}:${this.sourceId}`);
            this.memory!.state = "Active";
            this.clearStopReason("Mandated");
            memoryWriter.updateComponent(this);
        }
    }

    _stop() {
        this.loadMemory();
        this.addStopReason("Mandated");
    }

    _runCreeps() {
        this.loadMemory();
        let creeps = getCreeps(this.handle);
        if (creeps.length) {
            if (this.memory!.state === "Active") {
                let creepNames = Object.keys(this.creepAssignments);
                creepNames.forEach(name => {
                    if (!Game.creeps[name]) delete this.creepAssignments[name];
                });

                for (let creep of creeps) {
                    if (this.freeSpaces.length < creeps.length && creep.memory.jobName === "Primordial") {
                        creep.suicide();
                        delete this.creepAssignments[creep.name];
                    } else {
                        if (!this.creepAssignments[creep.name]) {
                            let populationSize = _.sum(this.configs, c => c.quantity);
                            this.creepAssignments[creep.name] = _assignMiningSpace(
                                creep,
                                this.freeSpaces,
                                this.sourceId,
                                this.creepAssignments,
                                populationSize
                            );
                        }
                        let assignment = this.creepAssignments[creep.name];
                        let primary = samePos(this.freeSpaces[0], assignment.placeToStand);
                        // Log.d(`${creep.name} running with data ${primary}`);
                        if (this.isSource) {
                            _runSourceMiner(creep, assignment, primary);
                            this.updateSourceLogisticsNodes(creep, assignment);
                        } else {
                            //TODO Run mineral miner
                        }
                    }
                }
            } else {
                unregisterNodes(this.parentRoomName, this.handle);
                for (let creep of creeps) {
                    if (_.random(0, 6) === 0) creep.swear();
                    let packedRally = getMapData(this.parentRoomName)?.pathingInfo?.packedRallyPos;
                    if (packedRally !== undefined) Traveler.travelTo(creep, unpackPos(packedRally));
                }
            }
        }
    }

    private clearStopReason(reason: MinerStopReason) {
        this.loadMemory();
        let index = this.memory!.stopReasons.indexOf(reason);
        if (index > -1) {
            this.memory!.stopReasons.splice(index, 1);
            if (this.memory!.stopReasons.length === 0) {
                this.memory!.state = "New";
                Log.i(
                    `Mining operation ${this.parentRoomName}->${this.roomName}:${this.sourceId} has been cleared of stop reason:${reason} and is toggling over to NEW`
                );
            } else {
                Log.i(
                    `Mining operation ${this.parentRoomName}->${this.roomName}:${
                        this.sourceId
                    } has been cleared of stop reason:${reason} remaining reasons:${JSON.stringify(
                        this.memory!.stopReasons
                    )}`
                );
            }
            memoryWriter.updateComponent(this);
        }
    }

    private addStopReason(reason: MinerStopReason) {
        this.loadMemory();
        if (this.memory!.state === "Stopped" && !this.memory!.stopReasons.includes(reason)) {
            this.memory!.stopReasons.push(reason);
            memoryWriter.updateComponent(this);
            Log.i(
                `Adding ${reason} to the list of reasons why mining operation ${this.parentRoomName}->${this.roomName}:${this.sourceId} is stopped`
            );
        }
        if (this.memory!.state !== "Stopped" && !this.memory!.stopReasons.includes(reason)) {
            this.memory!.stopReasons.push(reason);
            memoryWriter.updateComponent(this);
            Log.w(
                `Stopping mining operation ${this.parentRoomName}->${this.roomName}:${this.sourceId} because of reason:${reason}`
            );
        }
    }

    private loadMemory() {
        if (!this.memory) {
            if (!Memory.sourceMinerMemory) Memory.sourceMinerMemory = {};
            this.memory = Memory.sourceMinerMemory[this.sourceId as string];
            if (!this.memory) {
                let pathEstimate = 50;

                let mainStorage = getMainStorage(this.parentRoomName);
                if (this.freeSpaces.length > 0 && mainStorage) {
                    //No need to pick the best free space because we are ignoring terrain
                    pathEstimate = getMultirooomDistance(mainStorage.pos, this.freeSpaces[0]) * 1.25;
                }

                this.memory = {
                    state: "New",
                    stopReasons: [],
                    pathLength: pathEstimate,
                    pathCost: pathEstimate * 2
                };

                memoryWriter.updateComponent(this);
            }
        }
    }

    saveMemory(): void {
        if (!Memory.sourceMinerMemory) Memory.sourceMinerMemory = {};
        if (this.memory) {
            Memory.sourceMinerMemory[this.sourceId as string] = this.memory;
        }
    }

    //TODO mineral support here
    private updateSourceLogisticsNodes(creep: Creep, assignment: MinerAssignment) {
        if (creep.pos.getRangeTo(assignment.placeToStand) != 0) {
            return;
        }

        this.loadMemory();
        let pathLength = this.memory!.pathLength;
        let pathCost = this.memory!.pathCost;

        const piles = creep.pos.lookFor(LOOK_RESOURCES).filter(pile => pile.resourceType === RESOURCE_ENERGY);
        let pile: Resource | undefined;
        if (piles.length) pile = piles[0];

        let container = assignment.depositContainer ? Game.getObjectById(assignment.depositContainer) : undefined;

        let positionKey = pile?.resourceType + ":" + packPos(creep.pos);
        if (!container && !pile) {
            unregisterNode(this.parentRoomName, this.handle, positionKey);
        } else {
            let id: string;
            let level: number, maxLevel: number;
            let pos: RoomPosition;

            if (container) {
                id = container.id;
                level = container.store.getUsedCapacity(RESOURCE_ENERGY);
                maxLevel = container.store.getCapacity(RESOURCE_ENERGY);
                pos = container.pos;
            } else {
                pile = pile!;
                id = pile.id;
                level = pile.amount;
                maxLevel = 10000; //just an arbitrarily high number
                pos = pile.pos;
            }

            let existingNode = getNode(this.parentRoomName, positionKey);
            if (existingNode) {
                existingNode.targetId = id;
                existingNode.level = level;
                existingNode.maxLevel = maxLevel;
                existingNode.lastKnownPosition = pos;
                existingNode.serviceRoute.pathLength = pathLength;
                existingNode.serviceRoute.pathCost = pathCost;
            } else {
                registerNode(this.parentRoomName, this.handle, {
                    nodeId: positionKey,
                    targetId: id,
                    level: level,
                    maxLevel: maxLevel,
                    resource: RESOURCE_ENERGY,
                    baseDrdt:
                        creep.getBodyPower(WORK, "harvest", HARVEST_POWER) - (creep.getActiveBodyparts(CARRY) ? 0 : 1),
                    type: "Source",
                    analyticsCategories: [this.handle, "Exhumer"],
                    lastKnownPosition: pos,
                    serviceRoute: {
                        pathLength: pathLength,
                        pathCost: pathCost
                    }
                });
            }
        }
    }
}
