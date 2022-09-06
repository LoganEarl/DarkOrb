import { CATEGORY_ALL } from "./RoomStorageSystem";
import { _shardStorageSystem } from "./ShardStorageSystem";

export function getMainStorage(roomName: string): MainStorage | undefined {
    return _shardStorageSystem._getMainStorage(roomName);
}

export function postAnalyticsEvent(roomName: string, value: number, ...categories: string[]) {
    return _shardStorageSystem._postAnalyticsEvent(roomName, value, ...categories);
}

export function getTotalEnergyInPerTick(roomName: string): number {
    return _shardStorageSystem._getAnalyticsValue(roomName, CATEGORY_ALL);
}
