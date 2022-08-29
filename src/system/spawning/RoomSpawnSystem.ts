//Keeps track of the spawns in a room.
//Holds queued creep configs

import { JOB_NAME_SCOUT } from "system/scouting/ScoutInterface";
import { Log } from "utils/logger/Logger";
import { findStructure } from "utils/StructureFindCache";
import { bodyCost } from "utils/UtilityFunctions";
import { creepManifest } from "./CreepManifest";
import { CreepConfig } from "./SpawnInterface";

const DEFAULT_PRIORITIES = [
    "Sludger", //Miner
    "Drudge", //Hauler
    JOB_NAME_SCOUT //Scout
];

const DEFAULT_PRIORITY_COMPARITOR = (a: CreepConfig, b: CreepConfig) =>
    (DEFAULT_PRIORITIES.indexOf(a.jobName) ?? 9999999) - (DEFAULT_PRIORITIES.indexOf(b.jobName) ?? 9999999);
export class RoomSpawnSystem {
    public roomName: string;

    private creepConfigs: { [handle: string]: CreepConfig } = {};

    constructor(room: Room) {
        this.roomName = room.name;
    }

    public registerCreepConfig(config: CreepConfig) {
        this.creepConfigs[config.handle] = config;
    }

    public unregisterHandle(handle: string) {
        delete this.creepConfigs[handle];
    }

    public spawnCreeps() {
        let room = Game.rooms[this.roomName];
        if (room) {
            let readySpawns: StructureSpawn[] = findStructure(room, FIND_MY_SPAWNS)
                .map(s => s as StructureSpawn)
                .filter(s => !s.spawning);
            let readyToSpawn = Object.values(this.creepConfigs).filter(
                c => this.configShouldBeSpawned(c) && this.haveSufficientCapacity(c)
            );

            if (readyToSpawn.length && readySpawns.length) {
                for (let spawn of readySpawns) {
                    let next = _.min(readyToSpawn, DEFAULT_PRIORITY_COMPARITOR);
                    let result = spawn.spawnCreep(next.body, "SPAWN_TEST:" + Math.random(), { dryRun: true });
                    if (result == OK) {
                        let name = creepManifest.nextName(next.handle, next.jobName);
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

    private configShouldBeSpawned(config: CreepConfig): boolean {
        let currentPopulation = creepManifest
            .getCreeps(config.handle)
            .filter(c => !this.isReadyForPrespawn(c, config)).length;
        return currentPopulation < config.quantity;
    }

    private isReadyForPrespawn(creep: Creep, config: CreepConfig): boolean {
        let partPrespawn = config.dontPrespawnParts ? 0 : config.body.length * 3;
        let totalPrespawn = partPrespawn + (config.additionalPrespawntime ?? 0);
        let ticksUntilPrespawn = (creep.ticksToLive ?? CREEP_LIFE_TIME) - totalPrespawn;
        return ticksUntilPrespawn <= 0;
    }

    private haveSufficientCapacity(config: CreepConfig): boolean {
        return Game.rooms[this.roomName]!.energyCapacityAvailable >= bodyCost(config.body);
    }
}
