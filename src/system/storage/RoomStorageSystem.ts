import { MemoryComponent, memoryWriter } from "utils/MemoryWriter";
import { findStructure } from "utils/StructureFindCache";
import { clamp, drawBar, exponentialMovingAverage, irregularExponentialMovingAverage } from "utils/UtilityFunctions";

const ANALYTICS_WINDOW = 1500;
export const CATEGORY_ALL = "ALL";

export class RoomStorageSystem implements MemoryComponent {
    public roomName: string;

    private memory?: StorageMemory;

    constructor(room: Room) {
        this.roomName = room.name;
    }

    public _postAnalyticsEvent(value: number, ...categories: string[]) {
        this.loadMemory();
        let analytics = this.memory!.analytics;
        analytics[CATEGORY_ALL].nextTotal += value;

        categories.forEach(category => {
            if (!analytics[category]) analytics[category] = this.newAnalytics(category);
            analytics[category].nextTotal += value;
        });
    }

    public _getAnalyticsValue(category: string): number {
        this.loadMemory();
        return this.memory!.analytics[category]?.value ?? 0;
    }

    public _visualize() {
        this.loadMemory();
        let analytics = Object.values(this.memory!.analytics);
        let visual = new RoomVisual(this.roomName);

        analytics.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        let allEntry = this.memory!.analytics[CATEGORY_ALL];

        if (analytics[0].value !== 0) {
            drawBar(
                "Total:" + ("" + Math.round(allEntry.value)).padStart(4, " "),
                0,
                Math.abs(allEntry.value) / Math.abs(analytics[0].value),
                visual,
                allEntry.value > 0 ? "blue" : "purple"
            );
            let index = 1;
            for (let entry of analytics) {
                if (entry.category !== CATEGORY_ALL) {
                    if (Math.round(entry.value) !== 0) {
                        drawBar(
                            entry.category + ":" + ("" + Math.round(entry.value)).padStart(4, " "),
                            index++,
                            Math.abs(entry.value) / Math.abs(analytics[0].value),
                            visual,
                            entry.value > 0 ? "blue" : "purple"
                        );
                    }
                }
            }
        }
    }

    public _totalAnalytics() {
        this.loadMemory();
        let analytics = this.memory!.analytics;

        for (let category of Object.keys(analytics)) {
            let entry = analytics[category];
            //Edge case where it is new
            if (entry.lastSampleTime === -1) {
                entry.lastSampleTime = Game.time;
                entry.firstSampleTime = Game.time;
                entry.value = entry.nextTotal;
                entry.nextTotal = 0;
            }
            //Update the running average
            else {
                let window = clamp(Game.time - entry.firstSampleTime, 1, ANALYTICS_WINDOW);
                let nextValue = exponentialMovingAverage(entry.nextTotal, entry.value, window);
                entry.lastSampleTime = Game.time;
                entry.value = nextValue;
                entry.nextTotal = 0;
            }
        }
        memoryWriter.updateComponent(this);
    }

    public _getMainStorage(): MainStorage | undefined {
        let room = Game.rooms[this.roomName];
        if (room) {
            let storageStructures = findStructure(room, FIND_STRUCTURES).filter(
                s =>
                    s.structureType === STRUCTURE_CONTAINER ||
                    s.structureType === STRUCTURE_SPAWN ||
                    s.structureType === STRUCTURE_STORAGE ||
                    s.structureType === STRUCTURE_TERMINAL
            );
            if (storageStructures.length) {
                //figure out which one to use based on context
                let storage: StructureStorage | undefined;
                let terminal: StructureTerminal | undefined;
                let container: StructureContainer | undefined;
                let spawn: StructureSpawn | undefined;

                //sort to make it deterministic
                storageStructures.sort((a, b) => (a.id as string).localeCompare(b.id as string));

                storageStructures.forEach(s => {
                    if (s.isActive()) {
                        if (s.structureType === STRUCTURE_STORAGE) storage = s as StructureStorage;
                        if (s.structureType === STRUCTURE_TERMINAL) terminal = s as StructureTerminal;
                        if (s.structureType === STRUCTURE_CONTAINER) container = s as StructureContainer;
                        if (s.structureType === STRUCTURE_SPAWN) spawn = s as StructureSpawn;
                    }
                });

                //take any storage structure we can find
                return storage ?? terminal ?? container ?? spawn;
            }
        }
        return undefined;
    }

    private newAnalytics(category: string): AnalyticEntry {
        return {
            category: category,
            value: 0,
            lastSampleTime: -1, //Have to set these when we save
            firstSampleTime: -1,
            nextTotal: 0
        };
    }

    loadMemory(): void {
        if (!this.memory) {
            this.memory = Memory.storageMemory ?? {
                analytics: {}
            };
            if (!this.memory!.analytics[CATEGORY_ALL])
                this.memory!.analytics[CATEGORY_ALL] = this.newAnalytics(CATEGORY_ALL);
        }
    }

    saveMemory(): void {
        if (this.memory) Memory.storageMemory = this.memory;
    }
}
