import { _shardStorageSystem } from "./ShardStorageSystem";

export function getMainStorage(roomName: string): MainStorage | undefined {
    return _shardStorageSystem._getMainStorage(roomName);
}
