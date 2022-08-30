import { _creepManifest } from "./CreepManifest";
import { _shardSpawnSystem } from "./ShardSpawnSystem";

export function registerCreepConfig(config: CreepConfig, roomName?: string) {
    _shardSpawnSystem._registerCreepConfig(config, roomName);
}

export function unregisterHandle(handle: string, roomName?: string) {
    _shardSpawnSystem._unregisterHandle(handle, roomName);
}

export function getCreeps(handle: string): Creep[] {
    return _creepManifest._getCreeps(handle);
}

export function nextName(handle: string, jobName: string): string {
    return _creepManifest._nextName(handle, jobName);
}
