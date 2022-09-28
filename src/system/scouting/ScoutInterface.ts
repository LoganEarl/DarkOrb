import { MemoryComponent, updateMemory } from "utils/MemoryWriter";
import { unpackPos } from "utils/Packrat";
import { registerResetFunction } from "utils/SystemResetter";
import { scoutRoom } from "./ScoutLogic";
import { _shardScoutSystem } from "./ShardScoutSystem";

export const MAX_SCOUT_DEPTH = 6;

class MapMemory implements MemoryComponent {
    shardMap: ShardMap = {};

    loadMemory() {
        if (!Object.values(this.shardMap).length) {
            this.shardMap =
                Memory.mapData ??
                _.mapKeys(
                    _.unique(Object.values(Game.spawns).map(s => s.room)).map(room =>
                        scoutRoom(room, {}, MAX_SCOUT_DEPTH)
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

export function getRoomData(roomName: string): RoomScoutingInfo | undefined {
    memory.loadMemory();
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
