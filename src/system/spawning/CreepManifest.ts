//Persists a mapping of unique identifiers to creep names.
//Also keeps track of process id's and associates creep names to it so you can find all

import { MemoryComponent, memoryWriter } from "system/memory/MemoryWriter";
import { Log } from "utils/logger/Logger";
import { FIRST_NAMES } from "./creepNames/FirstNames";
import { LAST_NAMES } from "./creepNames/LastNames";

class CreepManifest implements MemoryComponent {
    private memory?: ManifestMemory;

    initialize() {
        this.loadMemory();
    }

    saveMemory(): void {
        if (this.memory) Memory.manifestMemory = this.memory;
    }

    //Get all living creeps under the handle
    public getCreeps(handle: string): Creep[] {
        this.loadMemory();
        return (
            this.memory!.creepNamesByHandle[handle].map(name => Game.creeps[name]).filter(c => c && !c.spawning) ?? []
        );
    }

    //Linear congruential gnerator to traverse name space. Hits each name once before looping (in theory)
    public nextName(creepHandle: string, jobName: string): string {
        this.loadMemory();
        this.memory = this.memory!;

        let totalNames = FIRST_NAMES.length * LAST_NAMES.length;

        var nextIndex = -1;
        var lastIndex = this.memory.previousNameIndex;
        do {
            nextIndex = (3 * lastIndex + 251) % totalNames;
            let firstNameIndex = Math.floor(nextIndex / LAST_NAMES.length);
            let lastNameIndex = Math.floor(nextIndex % FIRST_NAMES.length);

            let name = `${FIRST_NAMES[firstNameIndex]} ${LAST_NAMES[lastNameIndex]} <${jobName}>`;
            if (!Game.creeps[name]) {
                this.memory.previousNameIndex = nextIndex;
                this.memory.creepNamesByHandle[creepHandle] = (
                    this.memory.creepNamesByHandle[creepHandle] ?? []
                ).concat(name);
                Memory.manifestMemory!.previousNameIndex = nextIndex;
                memoryWriter.updateComponent(this);
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

export const creepManifest: CreepManifest = new CreepManifest();

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
