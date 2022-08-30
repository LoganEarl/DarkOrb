interface SourceMinerMemory {
    state: "Active" | "Suspended" | "New";
}

interface Memory {
    sourceMinerMemory: { [sourceId: string]: SourceMinerMemory };
}
