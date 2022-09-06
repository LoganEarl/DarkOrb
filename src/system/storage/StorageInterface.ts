import { _shardStorageSystem } from "./ShardStorageSystem";

export function getMainStorage(roomName: string): MainStorage | undefined {
    return _shardStorageSystem._getMainStorage(roomName);
}

export function postAnalyticsEvent(roomName: string, value: number, ...categories: string[]) {
    return _shardStorageSystem._postAnalyticsEvent(roomName, value, ...categories);
}
