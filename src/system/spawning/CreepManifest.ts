//Persists a mapping of unique identifiers to creep names.
//Also keeps track of process id's and associates creep names to it so you can find all

import { MemoryComponent, updateMemory } from "utils/MemoryWriter";
import { Log } from "utils/logger/Logger";
import { FIRST_NAMES } from "./creepNames/FirstNames";
import { LAST_NAMES } from "./creepNames/LastNames";
import { registerResetFunction } from "utils/SystemResetter";

class CreepManifest implements MemoryComponent {
    private memory?: ManifestMemory;

    saveMemory(): void {
        if (this.memory) Memory.manifestMemory = this.memory;
    }

    //Get all living creeps under the handle
    _getCreeps(handle: string, subHandle?: string): Creep[] {
        this.loadMemory();

        let byHandle = this.memory!.creepNamesByHandle[handle] ?? {};

        if (subHandle) {
            //Detect any that died during the query phase=
            let deadCreepNames = (byHandle[subHandle] ?? []).filter(name => !Game.creeps[name]);
            if (deadCreepNames.length > 0) {
                Log.d("Clearing memory for creeps with names: " + JSON.stringify(deadCreepNames));
                byHandle[subHandle] = byHandle[subHandle].filter(name => Game.creeps[name]);
                updateMemory(this);
            }

            return (byHandle[subHandle] ?? []).map(name => Game.creeps[name]).filter(c => c && !c.spawning) ?? [];
        } else {
            //Detect any that died during the query phase=
            let deadCreepNames = Object.values(byHandle)
                .reduce((acc, val) => acc.concat(val), [])
                .filter(name => !Game.creeps[name]);
            if (deadCreepNames.length > 0) {
                Log.d("Clearing memory for creeps with names: " + JSON.stringify(deadCreepNames));
                for (let subHandle of Object.keys(byHandle))
                    byHandle[subHandle] = byHandle[subHandle].filter(name => Game.creeps[name]);
                updateMemory(this);
            }

            return (
                Object.values(byHandle)
                    .reduce((acc, val) => acc.concat(val), [])
                    .map(name => Game.creeps[name])
                    .filter(c => c && !c.spawning) ?? []
            );
        }
    }

    //Linear congruential gnerator to traverse name space. Hits each name once before looping (in theory)
    _nextName(creepHandle: string, jobName: string, subHandle: string = "None"): string {
        this.loadMemory();
        this.memory = this.memory!;

        let totalNames = FIRST_NAMES.length * LAST_NAMES.length;

        var nextIndex = -1;
        var lastIndex = this.memory.previousNameIndex;
        do {
            nextIndex = (3 * lastIndex + 251) % totalNames;
            let firstNameIndex = Math.floor(nextIndex / LAST_NAMES.length);
            let lastNameIndex = Math.floor(nextIndex % LAST_NAMES.length);

            let name = `${FIRST_NAMES[firstNameIndex]} ${LAST_NAMES[lastNameIndex]} <${jobName}>`;
            Log.d(`Chose name with fIndex:${firstNameIndex} and lIndex:${lastNameIndex}`);

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
        } while (nextIndex != this.memory.previousNameIndex);
        Log.e("Failed to find the next creep name! They were all taken!");
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
