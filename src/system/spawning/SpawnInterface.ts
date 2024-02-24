import {Log} from "utils/logger/Logger";
import {_creepManifest} from "./CreepManifest";
import {
    _bodyCost,
    _configShouldBeSpawned,
    _haveSufficientCapacity,
    _maximizeBody,
    _maximizeBodyForTargetParts,
    _priorityComparator
} from "./SpawnLogic";

let creepConfigs: { [roomName: string]: { [handle: string]: CreepConfig[] } } = {};
//Denotes where we decided to put the given room-agnostic creep config via handle
let roomAgnosticConfigRooms: { [handle: string]: string } = {};
let spawnRooms: { [roomName: string]: SpawnRoom } = {};

export function registerCreepConfig(
    handle: string,
    configs: CreepConfig[],
    roomName?: string,
    territoryInfo?: RoomTerritoryInfo
) {
    // Log.d(`Registering creep config with info roomName:${roomName} handle:${handle}`);
    if (roomName) {
        if (!creepConfigs[roomName]) creepConfigs[roomName] = {};
        creepConfigs[roomName][handle] = configs;
    } else {
        //TODO Use the map data to find the best spawn room when we don't know the best room by default. Replace this crap with a real system later
        // the new system should use spawn loading and the registered spawn rooms better
        for (let spawnRoom in spawnRooms) {
            //Remove old room assignment
            if (roomAgnosticConfigRooms[handle] && creepConfigs[roomAgnosticConfigRooms[handle]]?.[handle]) {
                delete creepConfigs[roomAgnosticConfigRooms[handle]][handle];
            }
            if (!creepConfigs[spawnRoom]) creepConfigs[spawnRoom] = {};

            roomAgnosticConfigRooms[handle] = spawnRoom;
            creepConfigs[spawnRoom][handle] = configs;
            break;
        }
    }
    // printSpawnQueues();
}

export function _setSpawnRooms(newSpawnRooms: { [roomName: string]: SpawnRoom }) {
    spawnRooms = newSpawnRooms;
}

export function unregisterHandle(handle: string, roomName?: string) {
    // Log.d(`Unregistering creep config with info roomName:${roomName} handle:${handle}`);
    if (roomAgnosticConfigRooms[handle] && creepConfigs[roomAgnosticConfigRooms[handle]]) {
        delete creepConfigs[roomAgnosticConfigRooms[handle]];
        delete roomAgnosticConfigRooms[handle];
    } else if (roomName && creepConfigs[roomName]) {
        delete creepConfigs[roomName][handle];
    }
    // printSpawnQueues();
}

export function _getConfigs(roomName: string) {
    return creepConfigs[roomName] ?? {};
}

export function getCreeps(handle: string): Creep[] {
    return _creepManifest._getCreeps(handle);
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

export function printSpawnQueues() {
    for (let roomName in creepConfigs) {
        let all = Object.values(creepConfigs[roomName]).reduce((acc, val) => acc.concat(val), []);
        let active = all.filter(c => _configShouldBeSpawned(c) && _haveSufficientCapacity(Game.rooms[roomName], c));
        active.sort(_priorityComparator);
        Log.i(`${roomName} 
            Spawn Queue:\n ${active.map(c => displayCreepConfig(c))}
            All Configs:\n ${all.map(c => displayCreepConfig(c))}
            `);
    }
}

function displayCreepConfig(config: CreepConfig) {
    let partCount: { [part: string]: number } = {};
    config.body.forEach(p => {
        if (!partCount[p as string]) partCount[p as string] = 1;
        else partCount[p as string]++;
    });

    let keys = Object.keys(partCount);
    keys.sort();
    let bodyDescriptor = "";
    keys.forEach(key => (bodyDescriptor += key[0].toUpperCase() + partCount[key]));

    return `\t\tJob:${config.jobName} Body:${bodyDescriptor} Handle:${config.handle} SubHandle:${config.subHandle}\n`;
}
