//Persists a mapping of unique identifiers to creep names.
//Also keeps track of process id's and associates creep names to it so you can find all

import { MemoryComponent, updateMemory } from "utils/MemoryWriter";
import { Log } from "utils/logger/Logger";
import { FIRST_NAMES } from "./creepNames/FirstNames";
import { LAST_NAMES } from "./creepNames/LastNames";
import { registerResetFunction } from "utils/SystemResetter";
import { profile } from "../../utils/profiler/Profiler";

@profile
class CreepManifest implements MemoryComponent {
    private memory?: ManifestMemory;

    private creepCacheByHandle: { [handle: string]: Creep[] } = {};
    private creepCacheBySubHandle: { [handle: string]: { [subHandle: string]: Creep[] } } = {};
    private lastCacheTick = 0;

    saveMemory(): void {
        if (this.memory) Memory.manifestMemory = this.memory;
    }

    primeCache(): void {
        if (Game.time === this.lastCacheTick) {
            return; // Already primed for this tick
        }

        this.loadMemory(); // Load the name manifest from Memory
        this.creepCacheByHandle = {};
        this.creepCacheBySubHandle = {};
        this.lastCacheTick = Game.time;

        const allKnownCreepNames: { [name: string]: { handle: string; subHandle: string } } = {};
        // Invert the memory structure for faster lookups
        for (const handle in this.memory!.creepNamesByHandle) {
            for (const subHandle in this.memory!.creepNamesByHandle[handle]) {
                for (const creepName of this.memory!.creepNamesByHandle[handle][subHandle]) {
                    allKnownCreepNames[creepName] = { handle, subHandle };
                }
            }
        }

        const liveCreepNames: Set<string> = new Set();

        // Single loop through all living creeps
        for (const creepName in Game.creeps) {
            liveCreepNames.add(creepName);
            const creep = Game.creeps[creepName];
            const identity = allKnownCreepNames[creepName];

            if (identity) {
                const { handle, subHandle } = identity;

                // Populate cache by handle
                if (!this.creepCacheByHandle[handle]) {
                    this.creepCacheByHandle[handle] = [];
                }
                this.creepCacheByHandle[handle].push(creep);

                // Populate cache by sub-handle
                if (!this.creepCacheBySubHandle[handle]) {
                    this.creepCacheBySubHandle[handle] = {};
                }
                if (!this.creepCacheBySubHandle[handle][subHandle]) {
                    this.creepCacheBySubHandle[handle][subHandle] = [];
                }
                this.creepCacheBySubHandle[handle][subHandle].push(creep);
            }
        }

        // Now, clean up the memory structure based on dead creeps
        let memoryDirty = false;
        for (const handle in this.memory!.creepNamesByHandle) {
            for (const subHandle in this.memory!.creepNamesByHandle[handle]) {
                const originalCount = this.memory!.creepNamesByHandle[handle][subHandle].length;
                this.memory!.creepNamesByHandle[handle][subHandle] = this.memory!.creepNamesByHandle[handle][
                    subHandle
                ].filter(name => liveCreepNames.has(name));
                if (this.memory!.creepNamesByHandle[handle][subHandle].length !== originalCount) {
                    memoryDirty = true;
                }
            }
        }

        if (memoryDirty) {
            updateMemory(this);
        }
    }

    _getCreeps(handle: string, subHandle?: string): Creep[] {
        let spawned = this._getCreepSpawned(handle, subHandle);
        return spawned.filter(c => !c.spawning) ?? [];
    }

    _getCreepSpawned(handle: string, subHandle?: string): Creep[] {
        if (subHandle) {
            return this.creepCacheBySubHandle[handle]?.[subHandle] ?? [];
        }
        return this.creepCacheByHandle[handle] ?? [];
    }

    //Linear congruential generator to traverse name space. Hits each name once before looping (in theory)
    _nextName(creepHandle: string, jobName: string, subHandle: string = "None"): string {
        this.loadMemory();
        this.memory = this.memory!;

        let totalNames = FIRST_NAMES.length * LAST_NAMES.length;

        var nextIndex = -1;
        var lastIndex = this.memory.previousNameIndex;
        //Just in case I fucked up on my number choices
        let maxIterations = 10;
        do {
            nextIndex = (1000000007 * lastIndex + 251) % totalNames;
            let firstNameIndex = Math.floor(nextIndex / LAST_NAMES.length);
            let lastNameIndex = Math.floor(nextIndex % LAST_NAMES.length);

            let name = `${FIRST_NAMES[firstNameIndex]} ${LAST_NAMES[lastNameIndex]} <${jobName}>`;
            // Log.d(`Chose name with fIndex:${firstNameIndex} and lIndex:${lastNameIndex}`);

            if (!Game.creeps[name]) {
                this.memory.previousNameIndex = nextIndex;
                if (!this.memory.creepNamesByHandle[creepHandle]) this.memory.creepNamesByHandle[creepHandle] = {};

                this.memory.creepNamesByHandle[creepHandle][subHandle] = (
                    this.memory.creepNamesByHandle[creepHandle][subHandle] ?? []
                ).concat(name);
                this.memory.previousNameIndex = nextIndex;
                updateMemory(this);
                return name;
            }
            maxIterations--;
        } while (nextIndex != this.memory.previousNameIndex && maxIterations > 0);
        if (maxIterations === 0)
            Log.e("You need to tune the name generator's LRG, it isn't traversing everything");
        else Log.e("Failed to find the next creep name! They were all taken!");
        return `${_.random(0, 10000000)} <${jobName}>`;
    }

    private loadMemory() {
        if (!this.memory) {
            this.memory = Memory.manifestMemory ?? {
                previousNameIndex: _.random(0, FIRST_NAMES.length * LAST_NAMES.length),
                creepNamesByHandle: {}
            };
        }
    }
}

export let _creepManifest: CreepManifest = new CreepManifest();
registerResetFunction(() => (_creepManifest = new CreepManifest()));

/*
For when I invariably forget why this works and check this comment.
Pretend the letter combos are names and double check it
fnames = 2
lnames = 6
total = 12
fName = index / lnames length
lName = index % firstnames length


aa
ab
ac
ad
ae
af
ba
bb
bc
bd
be
bf
*/
