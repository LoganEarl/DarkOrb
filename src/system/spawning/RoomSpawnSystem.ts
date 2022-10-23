//Keeps track of the spawns in a room.
//Holds queued creep configs

import { getNode, registerNode, unregisterNode } from "system/hauling/HaulerInterface";
import { ANALYTICS_SPAWNING, ANALYTICS_SPAWN_GENERATION } from "system/storage/AnalyticsConstants";
import { getMainStorage, postAnalyticsEvent } from "system/storage/StorageInterface";
import { Log } from "utils/logger/Logger";
import { findStructure } from "utils/StructureFindCache";
import { getMultirooomDistance } from "utils/UtilityFunctions";
import { _creepManifest } from "./CreepManifest";
import { _getConfigs } from "./SpawnInterface";
import { _bodyCost, _configShouldBeSpawned, _haveSufficientCapacity, _priorityComparator } from "./SpawnLogic";

export class RoomSpawnSystem {
    public roomName: string;

    constructor(room: Room) {
        this.roomName = room.name;
    }

    _updateLogisticsNodes() {
        let room = Game.rooms[this.roomName];
        let storage = getMainStorage(this.roomName);
        if (room && storage) {
            let fillables = findStructure(room, FIND_MY_STRUCTURES)
                .filter(s => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION)
                .map(s => s as StructureSpawn | StructureExtension);

            for (let fillable of fillables) {
                let nodeId = "extension:" + fillable.id;
                let node = getNode(this.roomName, nodeId);
                if (node) {
                    if (fillable.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        node.level = fillable.store.getUsedCapacity(RESOURCE_ENERGY);
                        node.maxLevel = fillable.store.getCapacity(RESOURCE_ENERGY);
                    } else {
                        unregisterNode(this.roomName, "Spawning", nodeId);
                    }
                } else if (fillable.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                    let dist = getMultirooomDistance(storage!.pos, fillable.pos);
                    node = {
                        nodeId: nodeId,
                        targetId: fillable.id,
                        level: fillable.store.getUsedCapacity(RESOURCE_ENERGY),
                        maxLevel: fillable.store.getCapacity(RESOURCE_ENERGY),
                        resource: RESOURCE_ENERGY,
                        baseDrdt: 0,
                        type: "Sink",
                        analyticsCategories: [],
                        lastKnownPosition: fillable.pos,
                        priorityScalar: 50,
                        disableLimitedGrab: true,
                        serviceRoute: {
                            pathLength: dist,
                            pathCost: dist * 2
                        }
                    };
                    registerNode(this.roomName, "Spawning", node);
                }
            }
        }
    }

    _spawnCreeps() {
        let room = Game.rooms[this.roomName];
        if (room) {
            let readySpawns: StructureSpawn[] = findStructure(room, FIND_MY_SPAWNS)
                .map(s => s as StructureSpawn)
                .filter(s => !s.spawning);
            let readyToSpawn: CreepConfig[] = Object.values(_getConfigs(this.roomName))
                .reduce((acc, val) => acc.concat(val), [])
                .filter(c => _configShouldBeSpawned(c) && _haveSufficientCapacity(room, c));

            if (readyToSpawn.length && readySpawns.length) {
                if (room.energyAvailable < 300) postAnalyticsEvent(room.name, 1, ANALYTICS_SPAWN_GENERATION);

                for (let spawn of readySpawns) {
                    readyToSpawn.sort(_priorityComparator);
                    let next = readyToSpawn[0];
                    let result = spawn.spawnCreep(next.body, "SPAWN_TEST:" + Math.random(), { dryRun: true });
                    if (result == OK) {
                        let name = _creepManifest._nextName(next.handle, next.jobName, next.subHandle);
                        let memory = next.memory ?? {
                            handle: next.handle,
                            subHandle: next.subHandle,
                            jobName: next.jobName
                        };

                        result = spawn.spawnCreep(next.body, name, { memory: memory });
                        if (result == OK) {
                            //Remove the spawned creep from the list of ready ones if there is more than one spawn
                            if (readySpawns.length > 1) {
                                let i = readyToSpawn.indexOf(next);
                                if (i > -1) readyToSpawn.splice(i, 1);
                            }
                            postAnalyticsEvent(
                                this.roomName,
                                _bodyCost(next.body) * -1,
                                next.handle,
                                next.jobName,
                                ANALYTICS_SPAWNING
                            );
                            Log.i(`Spawned creep for handle ${next.handle}`);
                        } else {
                            Log.e(
                                `Failed to spawn creep with status: ${result} roomName:${this.roomName} spawnId: ${spawn.id} handle:${next.handle}`
                            );
                        }
                    } else if (result == ERR_NOT_ENOUGH_ENERGY) {
                        //not worried in this case. This will happen fairly often and isn't a problem
                    } else {
                        Log.e(
                            `Unable to spawn creep with status: ${result} roomName:${this.roomName} spawnId: ${spawn.id} handle:${next.handle}`
                        );
                    }
                }
            }
        }
    }
}
