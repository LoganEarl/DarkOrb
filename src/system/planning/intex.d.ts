interface StructureGroup {
    name?: string;
    shard?: string;
    rcl: number;
    buildings: { [type: string]: Positions };
}

type Positions = { pos: Coord[] };

interface PlacedStructureGroup {
    dx: number; //Flat amount to add to each structure's x value
    dy: number; //Flat amount to add to each structure's y value
    sx: number; //Scalar to apply to each structure's x value
    sy: number; //Scalar to apply to each structure's y value
    group: StructureGroup[]; //The group to place by RCL
}

interface PlannedRoom {
    unsuitable: boolean;
    storageCore?: PlacedStructureGroup;
    fastFiller?: PlacedStructureGroup;
    extensionPods?: PlacedStructureGroup[];
}

type PlannerMemory = { [roomName: string]: PlannedRoom };
interface Memory {
    plannerMemory: PlannerMemory;
}
