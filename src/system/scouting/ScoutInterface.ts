import { unpackPos } from "utils/Packrat";
import { _shardScoutSystem } from "./ShardScoutSystem";

export function getMapData(roomName: string): RoomScoutingInfo | undefined {
    return _shardScoutSystem._getMapData(roomName);
}

export function getRallyPosition(roomName: string): RoomPosition | undefined {
    let rawRally = _shardScoutSystem._getMapData(roomName)?.pathingInfo?.packedRallyPos;
    if (rawRally) return unpackPos(rawRally);
    return undefined;
}
