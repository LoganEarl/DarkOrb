import { _CATEGORY_ALL, _CATEGORY_EXPENDATURE, _CATEGORY_GOSS_INCOME } from "./RoomStorageSystem";
import { _shardStorageSystem } from "./ShardStorageSystem";

export const ANALYTICS_CATEGORY_ALL = _CATEGORY_ALL;
export const ANALYTICS_CATEGORY_IN = _CATEGORY_GOSS_INCOME;
export const ANALYTICS_CATEGORY_OUT = _CATEGORY_EXPENDATURE;

export function getMainStorage(roomName: string): MainStorage | undefined {
    return _shardStorageSystem._getMainStorage(roomName);
}

export function postAnalyticsEvent(roomName: string, value: number, ...categories: string[]) {
    return _shardStorageSystem._postAnalyticsEvent(roomName, value, ...categories);
}

export function getNetEnergyInPerTick(roomName: string): number {
    return _shardStorageSystem._getAnalyticsValue(roomName, ANALYTICS_CATEGORY_ALL);
}

export function getEnergyPerTick(roomName: string, category: string): number {
    return _shardStorageSystem._getAnalyticsValue(roomName, category);
}
