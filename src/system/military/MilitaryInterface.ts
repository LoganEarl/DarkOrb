import { MemoryComponent, updateMemory } from "../../utils/MemoryWriter";
import { registerResetFunction } from "../../utils/SystemResetter";

//For things like fucking with our neighbors
export const MILITARY_PRIORITY_LOW = 0;

//For things like defending our remotes
export const MILITARY_PRIORITY_MEDIUM = 100;

//For defending our own rooms
export const MILITARY_PRIORITY_HIGH = 200;

class OperationMemoryComponent implements MemoryComponent {
    operations: MilitaryOperationMemory = {};

    loadMemory() {
        if (!this.operations) {
            this.operations = Memory.militaryMemory?.militaryOperations ?? {};
        }
    }

    saveMemory(): void {
        if (this.operations) {
            if (!Memory.militaryMemory) Memory.militaryMemory = {};
            Memory.militaryMemory.militaryOperations = this.operations;
        }
    }
}

let memory: OperationMemoryComponent = new OperationMemoryComponent();
registerResetFunction(() => (memory = new OperationMemoryComponent()));

export function registerMilitaryOperation(parentRoomName: string, operation: MilitaryOperation) {
    memory.loadMemory();
    if (!memory.operations[parentRoomName]) memory.operations[parentRoomName] = {};
    memory.operations[parentRoomName][operation.operationId] = operation;
    updateMemory(memory)
}

export function deleteMilitaryOperation(parentRoomName: string, operationId: string) {
    memory.loadMemory();
    if (memory.operations[parentRoomName]) delete memory.operations[parentRoomName][operationId];
    updateMemory(memory);
}

export function getMilitaryOperations(parentRoomName: string) {
    memory.loadMemory();
    return memory.operations[parentRoomName];
}
