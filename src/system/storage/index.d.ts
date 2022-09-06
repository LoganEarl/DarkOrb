type MainStorage = StructureContainer | StructureStorage | StructureSpawn | StructureTerminal;

interface AnalyticEntry {
    category: string;
    value: number;
    lastSampleTime: number;
    firstSampleTime: number;
    nextTotal: number;
}
interface StorageMemory {
    analytics: { [category: string]: AnalyticEntry };
}
interface Memory {
    storageMemory?: StorageMemory;
}
