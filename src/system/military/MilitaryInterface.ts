import {MemoryComponent, updateMemory} from "../../utils/MemoryWriter";
import {registerResetFunction} from "../../utils/SystemResetter";

class OperationMemoryComponent implements MemoryComponent {
    operations: MilitaryOperationMemory = {};

    loadMemory() {
        if (!this.operations) {
            this.operations = Memory.militaryOperations ?? {};
        }
    }

    saveMemory(): void {
        if (this.operations) {
            Memory.militaryOperations = this.operations;
        }
    }
}

let memory: OperationMemoryComponent = new OperationMemoryComponent();
registerResetFunction(() => (memory = new OperationMemoryComponent()));

export function registerMilitaryOperation(parentRoomName: string, operation: MilitaryOperation) {
    memory.loadMemory();
    if(!memory.operations[parentRoomName]) memory.operations[parentRoomName] = {};
    memory.operations[parentRoomName][operation.operationId] = operation;
    updateMemory(memory)
}

export function deleteMilitaryOperation(parentRoomName: string, operationId: string) {
    memory.loadMemory();
    if(memory.operations[parentRoomName]) delete memory.operations[parentRoomName][operationId];
    updateMemory(memory);
}