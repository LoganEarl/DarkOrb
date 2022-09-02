import { getMapData } from "system/scouting/ScoutInterface";
import { registerCreepConfig, unregisterHandle } from "system/spawning/SpawnInterface";
import { getMainStorage } from "system/storage/StorageInterface";
import { Log } from "utils/logger/Logger";
import { MemoryComponent, memoryWriter } from "utils/MemoryWriter";
import { unpackId, unpackPosList } from "utils/Packrat";
import { getMultirooomDistance } from "utils/UtilityFunctions";
import { _designCreepsForMineral, _designCreepsForSource, _findPathToFreeSpace } from "./MinerLogic";

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
            let ourSourceData = _.find(
                roomData!.miningInfo!.sources,
                s => unpackId(s.packedId) == (this.sourceId as string)
            );
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

    _reloadCreepConfigs() {
        this.loadMemory();

        let parentRoom = Game.rooms[this.parentRoomName];
        if (parentRoom) {
            this.clearStopReason("NoHomeRoom");
        } else {
            this.addStopReason("NoHomeRoom");
        }

        let handle = `Mining:${this.parentRoomName}->${this.roomName}:${this.sourceId}`;
        if (this.memory!.state !== "Active") {
            //When we aren't active we prevent additional creep spawns. We DONT stop running though.
            unregisterHandle(handle, this.parentRoomName);
        } else {
            //Get map data so we know how big to make our creep
            let mapData: RoomScoutingInfo | undefined = getMapData(this.roomName);
            if (mapData) {
                this.clearStopReason("NoMapData");
                let configs: CreepConfig[];
                if (this.isSource) {
                    configs = _designCreepsForSource(
                        handle,
                        this.freeSpaces.length,
                        parentRoom,
                        this.memory!.pathLength,
                        mapData
                    );
                } else {
                    configs = [
                        _designCreepsForMineral(handle, this.freeSpaces.length, parentRoom, this.memory!.pathLength)
                    ];
                }
                registerCreepConfig(handle, configs, this.parentRoomName);
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
}
