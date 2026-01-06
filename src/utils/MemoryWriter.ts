export interface MemoryComponent {
    saveMemory(): void;
}

class MemoryWriter {
    private components: MemoryComponent[] = [];

    //Call from memory components so that they will get their memory written in
    public updateComponent(component: MemoryComponent) {
        if (this.components.indexOf(component) === -1)
            this.components.push(component);
    }

    //Called by the main loop. This will update all the components at once
    public updateAll() {
        this.components.forEach(c => c.saveMemory());
        this.components = [];
    }
}

const memoryWriter: MemoryWriter = new MemoryWriter();

export function updateMemory(component: MemoryComponent) {
    memoryWriter.updateComponent(component);
}

export function updateAllMemory() {
    memoryWriter.updateAll();
}
