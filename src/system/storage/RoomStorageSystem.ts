import { findStructure } from "utils/StructureFindCache";

export class RoomStorageSystem {
    public roomName: string;

    constructor(room: Room) {
        this.roomName = room.name;
    }

    public getMainStorage(): MainStorage | undefined {
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
}
