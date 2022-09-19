type StructureGroup = {
    name?: string;
    shard?: string;
    rcl: number;
    buildings: { [type: string]: Positions };
};

type Positions = { pos: Coord[] };
