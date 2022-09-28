import { clone2DArray, rotateMatrixTurns } from "utils/UtilityFunctions";

interface RawStructureGroup {
    name?: string;
    shard?: string;
    rcl: number;
    buildings: { [type: string]: Positions };
}

type Positions = { pos: Coord[] };

export function rotateGroup(groupByRCL: StructureGroup[], turns: 0 | 1 | 2 | 3): StructureGroup[] {
    let result: StructureGroup[] = [];
    for (let i = 1; i <= 8; i++) {
        result[i] = Object.assign({}, groupByRCL[i]);
        let rotated = clone2DArray(result[i].buildings);
        rotateMatrixTurns(rotated, turns);
        result[i].buildings = rotated;
    }
    return result;
}

export function parseStructures(structureJsons: string[]): StructureGroup[] {
    let groups = structureJsons.map(json => JSON.parse(json) as RawStructureGroup).map(s => compileRawStamp(s));
    let groupsByRcl: StructureGroup[] = [];
    // Log.d(`Parsed raw groups: ${JSON.stringify(rawGroups)}`);
    let lastGroup: StructureGroup = {
        rcl: 0,
        buildings: []
    };

    let groupIndex = 0;
    for (let rcl = 1; rcl <= 8; rcl++) {
        // Log.d(`Looping for rcl: ${rcl}`);
        if (groupIndex < groups.length) {
            let group = groups[groupIndex];
            //If we have reached the rcl where we should place the building
            if (rcl >= group.rcl) {
                // Log.d(`Used group ${groupIndex} for rcl ${rcl}`);
                groupsByRcl[rcl] = Object.assign({}, group);
                lastGroup = group;
                groupIndex++;
            }
            //The group starts at a higher rcl. don't increase the group index, but do increase the rcl
            else {
                // Log.d(`No plans registered for RCL: ${rcl}, going with last group`);
                groupsByRcl[rcl] = Object.assign({}, lastGroup);
            }
        } else {
            // Log.d(`No plans registered for RCL: ${rcl} because it is greater than the number of groups.`);
            groupsByRcl[rcl] = Object.assign({}, lastGroup);
        }

        groupsByRcl[rcl].rcl = rcl;
    }

    // Log.d(JSON.stringify(Array.from(groupsByRcl.entries())));

    return groupsByRcl;
}

function compileRawStamp(rawGroup: RawStructureGroup): StructureGroup {
    let buildings: BuildableStructureConstant[][][] = [];
    for (let rawType in rawGroup.buildings) {
        let type = rawType as BuildableStructureConstant;
        let coords = rawGroup.buildings[rawType]?.pos ?? [];
        for (let coord of coords) {
            if (!buildings[coord.y]) buildings[coord.y] = [];
            if (!buildings[coord.y][coord.x]) buildings[coord.y][coord.x] = [];
            if (!buildings[coord.y][coord.x].includes(type)) buildings[coord.y][coord.x].push(type);
        }
    }

    //Want a square array so we can rotate it freely
    makeSquare(buildings, []);

    return {
        name: rawGroup.name,
        rcl: rawGroup.rcl,
        buildings: buildings
    };
}

function makeSquare<T>(mat: T[][], empty: T): void {
    let size = _.max([mat.length, ...mat.map(v => v.length)]);
    for (let y = 0; y < size; y++) {
        if (!mat[y]) mat[y] = [];
        for (let x = 0; x < size; x++) {
            if (!mat[y][x]) mat[y][x] = empty;
        }
    }
}
