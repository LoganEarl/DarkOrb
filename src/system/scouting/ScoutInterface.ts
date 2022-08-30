import { shardScoutSystem } from "./ShardScoutSystem";

export function getMapData(roomName: string): RoomScoutingInfo | undefined {
    return shardScoutSystem._getMapData(roomName);
}
