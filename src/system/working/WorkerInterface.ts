import {MemoryComponent, updateMemory} from "utils/MemoryWriter";
import {registerResetFunction} from "utils/SystemResetter";

class DetailMemoryComponent implements MemoryComponent {
    details: WorkDetailMemory = {};

    loadMemory() {
        if (!this.details) {
            this.details = Memory.workDetails ?? {};
        }
    }

    saveMemory(): void {
        if (this.details) {
            Memory.workDetails = this.details;
        }
    }
}

let memory: DetailMemoryComponent = new DetailMemoryComponent();
registerResetFunction(() => (memory = new DetailMemoryComponent()));

export function registerWorkDetail(roomName: string, detail: WorkDetail) {
    memory.loadMemory();
    let perRoom = memory.details[roomName] ?? {};
    perRoom[detail.detailId] = detail;
    memory.details[roomName] = perRoom;
    updateMemory(memory);
}

export function getWorkDetails(roomName: string): { [detailId: string]: WorkDetail } {
    memory.loadMemory();
    return memory.details[roomName] ?? {};
}

export function getWorkDetailsOfType(roomName: string, type: DetailType): WorkDetail[] {
    return Object.values(memory.details[roomName] ?? {}).filter(d => d.detailType === type);
}

export function getWorkDetailById(roomName: string, detailId: string): WorkDetail | undefined {
    return memory.details[roomName]?.[detailId];
}

export function deleteWorkDetail(roomName: string, detailId: string) {
    memory.loadMemory();
    if (memory.details[roomName]?.[detailId]) delete memory.details[roomName]?.[detailId];
    updateMemory(memory);
}

export function completeWorkTarget(roomName: string, detailId: string, targetId: string) {
    memory.loadMemory();
    if (memory.details[roomName]?.[detailId]?.targets[targetId]) {
        //Delete the given target
        delete memory.details[roomName][detailId].targets[targetId];
        //This completes the entire work detail if all the targets are gone
        if (Object.values(memory.details[roomName][detailId].targets).length === 0) {
            delete memory.details[roomName][detailId];
        }
    }
    updateMemory(memory);
}
