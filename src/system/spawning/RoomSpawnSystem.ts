//Keeps track of the spawns in a room.
//Holds queued creep configs

import { PriorityQueue } from "utils/PriorityQueue";
import { findStructure } from "utils/StructureFindCache";
import { bodyCost } from "utils/UtilityFunctions";
import { creepManifest } from "./CreepManifest";
import { CreepConfig } from "./SpawnInterface";

const DEFAULT_PRIORITIES = [
    "Sludger", //Miner
    "Drudge", //Hauler
    "Aspect" //Scout
];

const DEFAULT_PRIORITY_COMPARITOR = (a: SortedConfigWrapper, b: SortedConfigWrapper) =>
    (DEFAULT_PRIORITIES.indexOf(a.creepConfig.jobName) ?? 9999999) -
    (DEFAULT_PRIORITIES.indexOf(b.creepConfig.jobName) ?? 9999999);

class SortedConfigWrapper {
    public creepConfig: CreepConfig;
    public queueIndex: number;

    constructor(config: CreepConfig) {
        this.creepConfig = config;
        this.queueIndex = 0; //will get overwritten
    }
}

export class RoomSpawnSystem {
    public roomName: string;

    private spawnQueue: PriorityQueue<SortedConfigWrapper>;
    private queuedConfigHandles: Set<string> = new Set();

    private creepConfigs: { [handle: string]: SortedConfigWrapper } = {};

    constructor(room: Room) {
        this.roomName = room.name;
        this.spawnQueue = new PriorityQueue<SortedConfigWrapper>(100, DEFAULT_PRIORITY_COMPARITOR);
    }

    public registerCreepConfig(config: CreepConfig) {
        let previousRegistration = this.creepConfigs[config.handle];
        if (previousRegistration) {
            this.spawnQueue.remove(previousRegistration);
            this.queuedConfigHandles.delete(previousRegistration.creepConfig.handle);
        }
        this.creepConfigs[config.handle] = new SortedConfigWrapper(config);
    }

    public spawnCreeps() {
        let room = Game.rooms[this.roomName];
        if (room) {
            this.checkSpawnQueue();

            if (this.spawnQueue.length != 0) {
                let readySpawns: StructureSpawn[] = findStructure(room, FIND_MY_SPAWNS)
                    .map(s => s as StructureSpawn)
                    .filter(s => !s.spawning);
                for (let spawn of readySpawns) {
                    let next = this.spawnQueue.peek()!.creepConfig;
                    let result = spawn.spawnCreep(next.body, "SPAWN_TEST:" + Math.random(), { dryRun: true });
                    if (result == OK) {
                        let name = creepManifest.nextName(next.handle, next.jobName);
                        result = spawn.spawnCreep(next.body, name, { memory: next.memory });
                        this.spawnQueue.dequeue();
                        this.queuedConfigHandles.delete(next.handle);
                    }
                }
            }
        }
    }

    private checkSpawnQueue() {
        Object.values(this.creepConfigs)
            .map(c => c.creepConfig)
            .filter(c => !this.queuedConfigHandles.has(c.handle))
            .filter(this.haveSufficientCapacity)
            .filter(this.configShouldBeSpawned)
            .forEach(c => {
                this.spawnQueue.enqueue(new SortedConfigWrapper(c));
                this.queuedConfigHandles.add(c.handle);
            });
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
        return ticksUntilPrespawn > 0;
    }

    private haveSufficientCapacity(config: CreepConfig): boolean {
        return Game.rooms[this.roomName]!.energyCapacityAvailable >= bodyCost(config.body);
    }
}
