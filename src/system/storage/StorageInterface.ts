import { ANALYTICS_ALL } from "./AnalyticsConstants";
import { _shardStorageSystem } from "./ShardStorageSystem";

export function getMainStorage(roomName: string): MainStorage | undefined {
    return _shardStorageSystem._getMainStorage(roomName);
}

export function postAnalyticsEvent(roomName: string, value: number, ...categories: string[]) {
    return _shardStorageSystem._postAnalyticsEvent(roomName, value, ...categories);
}

export function getNetEnergyInPerTick(roomName: string): number {
    return _shardStorageSystem._getAnalyticsValue(roomName, ANALYTICS_ALL);
}

export function getEnergyPerTick(roomName: string, category: string): number {
    return _shardStorageSystem._getAnalyticsValue(roomName, category);
}
