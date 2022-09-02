import { _creepManifest } from "./CreepManifest";
import { _shardSpawnSystem } from "./ShardSpawnSystem";
import { _bodyCost, _maximizeBody, _maximizeBodyForTargetParts } from "./SpawnLogic";

export function registerCreepConfig(handle: string, configs: CreepConfig[], roomName?: string) {
    _shardSpawnSystem._registerCreepConfig(handle, configs, roomName);
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

export function bodyCost(body: BodyPartConstant[]): number {
    return _bodyCost(body);
}

export function maximizeBodyForTargetParts(
    baseBody: BodyPartConstant[],
    repeatingBody: BodyPartConstant[],
    targetPart: BodyPartConstant,
    targetNumber: number,
    maxCapacity: number,
    maxCreeps?: number,
    sorter?: BodySorter
): BodyPartConstant[][] {
    return _maximizeBodyForTargetParts(
        baseBody,
        repeatingBody,
        targetPart,
        targetNumber,
        maxCapacity,
        maxCreeps,
        sorter
    );
}

export function maximizeBody(
    baseBody: BodyPartConstant[],
    repeatingBody: BodyPartConstant[],
    maxCapacity: number,
    sorter?: BodySorter
): BodyPartConstant[] {
    return _maximizeBody(baseBody, repeatingBody, maxCapacity, sorter);
}
