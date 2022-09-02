//Keeps track of the spawns in a room.
//Holds queued creep configs

import { Log } from "utils/logger/Logger";
import { findStructure } from "utils/StructureFindCache";
import { _creepManifest } from "./CreepManifest";
import { _configShouldBeSpawned, _haveSufficientCapacity } from "./SpawnLogic";

export class RoomSpawnSystem {
    public roomName: string;

    private creepConfigs: { [handle: string]: CreepConfig[] } = {};

    private defaultPriorities = [
        "Aspect", //Scout
        "Exhumer", //Miner
        "Drudge", //Hauler
        "Sludger" //Mineral miner
    ];

    private priorityComparator = (a: CreepConfig, b: CreepConfig) =>
        (this.defaultPriorities.indexOf(a.jobName) ?? 9999999) - (this.defaultPriorities.indexOf(b.jobName) ?? 9999999);

    constructor(room: Room) {
        this.roomName = room.name;
    }

    _registerCreepConfig(handle: string, configs: CreepConfig[]) {
        this.creepConfigs[handle] = configs;
    }

    _unregisterHandle(handle: string) {
        delete this.creepConfigs[handle];
    }

    _spawnCreeps() {
        let room = Game.rooms[this.roomName];
        if (room) {
            let readySpawns: StructureSpawn[] = findStructure(room, FIND_MY_SPAWNS)
                .map(s => s as StructureSpawn)
                .filter(s => !s.spawning);
            let readyToSpawn: CreepConfig[] = Object.values(this.creepConfigs)
                .reduce((acc, val) => acc.concat(val), [])
                .filter(c => _configShouldBeSpawned(c) && _haveSufficientCapacity(room, c));

            if (readyToSpawn.length && readySpawns.length) {
                for (let spawn of readySpawns) {
                    let next = _.min(readyToSpawn, this.priorityComparator);
                    let result = spawn.spawnCreep(next.body, "SPAWN_TEST:" + Math.random(), { dryRun: true });
                    if (result == OK) {
                        let name = _creepManifest._nextName(next.handle, next.jobName);
                        result = spawn.spawnCreep(next.body, name, { memory: next.memory });
                        if (result == OK) {
                            //Remove the spawned creep from the list of ready ones if there is more than one spawn
                            if (readySpawns.length > 1) {
                                let i = readyToSpawn.indexOf(next);
                                if (i > -1) readyToSpawn.splice(i, 1);
                            }
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
