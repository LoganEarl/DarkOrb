interface Structure {
    isWalkable: boolean;
}

interface StructureContainer {
    energy: number;
    isFull: boolean;
    isEmpty: boolean;
}

interface StructureController {
    needsReserving(reserveBuffer: number): boolean;
}

interface Creep {
    getBodyPower(selectedPart: BodyPartConstant, operation: any, basePower: number): number;

    getTicksToMove(totalCost: number, numPathSteps: number): number;

    queueSay(toSay: string, toAll?: boolean): void;

    sayWaiting(): void;

    swear(): void;
}

interface StructureExtension {
    isFull: boolean;
    isEmpty: boolean;
}

interface StructureLink {
    isFull: boolean;
    isEmpty: boolean;
}

interface StructureStorage {
    energy: number;
    isFull: boolean;
    isEmpty: boolean;
}

interface StructureSpawn {
    isFull: boolean;
    isEmpty: boolean;

    cost(bodyArray: string[]): number;
}

interface StructureTerminal {
    energy: any;
    isFull: boolean;
    isEmpty: boolean;
    // _send(resourceType: ResourceConstant, amount: number, destination: string, description?: string): ScreepsReturnCode;
}

interface StructureTower {
    isFull: boolean;
    isEmpty: boolean;

    // run(): void;
    //
    // attackNearestEnemy(): number;
    //
    // healNearestAlly(): number;
    //
    // repairNearestStructure(): number;
    //
    // preventRampartDecay(): number;
}

interface Tombstone {
    energy: number;
}

interface RoomPosition {
    print: string;
    printPlain: string;
    room: Room | undefined;
    name: string;
    coordName: string;
    isEdge: boolean;
    isVisible: boolean;
    rangeToEdge: number;
    localCoords: Coord;
    roomCoords: Coord;
    neighbors: RoomPosition[];

    inRangeToPos(pos: RoomPosition, range: number): boolean;

    inRangeToXY(x: number, y: number, range: number): boolean;

    getRangeToXY(x: number, y: number): number;

    getPositionsAtRange(range: number, includeWalls?: boolean, includeEdges?: boolean): RoomPosition[];

    getPositionsInRange(range: number, includeWalls?: boolean, includeEdges?: boolean): RoomPosition[];

    getOffsetPos(dx: number, dy: number): RoomPosition;

    lookFor<T extends keyof AllLookAtTypes>(structureType: T): Array<AllLookAtTypes[T]>;

    lookForStructure(structureType: StructureConstant): Structure | undefined;

    isWalkable(ignoreCreeps?: boolean): boolean;

    availableNeighbors(ignoreCreeps?: boolean): RoomPosition[];

    getPositionAtDirection(direction: DirectionConstant, range?: number): RoomPosition;

    getMultiRoomRangeTo(pos: RoomPosition): number;

    findClosestByLimitedRange<T>(
        objects: T[] | RoomPosition[],
        rangeLimit: number,
        opts?: { filter: any | string }
    ): T | undefined;

    findClosestByMultiRoomRange<T extends _HasRoomPosition>(objects: T[]): T | undefined;

    findClosestByRangeThenPath<T extends _HasRoomPosition>(objects: T[]): T | undefined;
}
