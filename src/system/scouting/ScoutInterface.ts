import { _shardScoutSystem } from "./ShardScoutSystem";

export function getMapData(roomName: string): RoomScoutingInfo | undefined {
    return _shardScoutSystem._getMapData(roomName);
}
