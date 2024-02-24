import {MemoryComponent, updateMemory} from "utils/MemoryWriter";
import {unpackPos} from "utils/Packrat";
import {registerResetFunction} from "utils/SystemResetter";
import {_canBeUpdated, _scoutRoom} from "./ScoutLogic";

export const MAX_SCOUT_DEPTH = 6;

class MapMemory implements MemoryComponent {
    shardMap: ShardMap = {};

    loadMemory() {
        if (!Object.values(this.shardMap).length) {
            this.shardMap =
                Memory.mapData ??
                _.mapKeys(
                    _.unique(Object.values(Game.spawns).map(s => s.room)).map(room =>
                        _scoutRoom(room, {}, MAX_SCOUT_DEPTH)
                    ),
                    s => s.roomName
                );
        }
    }

    saveMemory(): void {
        if (this.shardMap) {
            Memory.mapData = this.shardMap;
        }
    }
}

let memory: MapMemory = new MapMemory();
registerResetFunction(() => (memory = new MapMemory()));

export function scoutRoom(room: Room): void {
    memory.loadMemory();
    if (_canBeUpdated(memory.shardMap[room.name])) {
        let data = _scoutRoom(room, memory.shardMap, MAX_SCOUT_DEPTH, memory.shardMap[room.name]);
        memory.shardMap[room.name] = data;
        updateMemory(memory);
    }
}

export function getRoomData(roomName: string): RoomScoutingInfo | undefined {
    memory.loadMemory();
    // Log.d(`Returning room data ${JSON.stringify(memory.shardMap![roomName])}`);
    return memory.shardMap![roomName];
}

export function getShardData(): ShardMap {
    memory.loadMemory();
    return memory.shardMap;
}

export function saveMapData(data?: RoomScoutingInfo): void {
    memory.loadMemory();
    if (data) memory.shardMap[data.roomName] = data;
    updateMemory(memory);
}

export function getRallyPosition(roomName: string): RoomPosition | undefined {
    let rawRally = getRoomData(roomName)?.pathingInfo?.packedRallyPos;
    if (rawRally) return unpackPos(rawRally);
    return undefined;
}
