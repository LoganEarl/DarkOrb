import { floodFill } from "utils/algorithms/FloodFill";
import { Log } from "utils/logger/Logger";
import { PriorityQueue, PriorityQueueItem } from "utils/PriorityQueue";
import { isWalkableOwnedRoom, manhattanDistance } from "utils/UtilityFunctions";
import { STORAGE_CORE_GROUP } from "./stamp/StorageCore";

export function drawStructureGroup(visual: RoomVisual, group: StructureGroup) {
    for (let building in group.buildings) {
        let coords = group.buildings[building]!.pos;
        coords.forEach(c => visual.structure(c.x, c.y, building as BuildableStructureConstant, {}));
    }
}

export function drawPlacedStructureGroup(visual: RoomVisual, placed: PlacedStructureGroup) {
    for (let building in placed.group.buildings) {
        let coords = placed.group.buildings[building]!.pos;
        coords.forEach(c =>
            visual.structure(
                c.x * placed.sx + placed.dx,
                c.y * placed.sy + placed.dy,
                building as BuildableStructureConstant,
                {}
            )
        );
    }
}

interface ScoredCoord extends Coord, PriorityQueueItem {
    score: number; //Lower is better
    queueIndex: number;
}

const MIN_EDGE_DISTANCE = 6;
const MIN_CONSTROLLER_DISTANCE = 4;
const MIN_CONSTROLLER_RANGE = 4;

export function placeStorageCore(room: Room): PlacedStructureGroup | undefined {
    let controllerPos = room.controller!.pos;

    //First flood fill from the controller to get available positions.
    let controllerMatrix = floodFill(room, [room.controller!.pos], true);
    let possibleCoords: PriorityQueue<ScoredCoord> = new PriorityQueue(48 * 48, (a, b) => a.score - b.score);

    //Second, flood fill from the edges so we can sort out places too close to edges.
    //We need to flood fill because being near to edges is fine as long as we aren't also near to exits
    let edgeMatrix = floodFill(
        room,
        room.find(FIND_EXIT).map(p => p.localCoords),
        true
    );

    for (let y = 2; y < 48; y++) {
        for (let x = 2; x < 48; x++) {
            if (controllerMatrix.get(x, y) >= MIN_CONSTROLLER_DISTANCE && edgeMatrix.get(x, y) >= MIN_EDGE_DISTANCE) {
                possibleCoords.enqueue({
                    x: x,
                    y: y,
                    score: controllerMatrix.get(x, y) * 4 - edgeMatrix.get(x, y),
                    queueIndex: 0 //Will get overwritten
                });
            }
        }
    }

    let invalidator = (coord: Coord): boolean => {
        return (
            edgeMatrix.get(coord.x, coord.y) < MIN_EDGE_DISTANCE ||
            controllerMatrix.get(coord.x, coord.y) < MIN_CONSTROLLER_DISTANCE
        );
    };
    let placement: PlacedStructureGroup | undefined;
    while (!placement && possibleCoords.length > 0) {
        let testPosition = possibleCoords.dequeue()!;
        let controllerRange = manhattanDistance(testPosition.x, testPosition.y, controllerPos.x, controllerPos.y);
        if (controllerRange >= MIN_CONSTROLLER_RANGE) {
            let testPlacement: PlacedStructureGroup = {
                dx: testPosition.x,
                dy: testPosition.y,
                sx: 1,
                sy: 1,
                group: STORAGE_CORE_GROUP[8]
            };
            if (isValidPlacement(room, testPlacement, [], invalidator)) return testPlacement;
            testPlacement.sx = -1;
            if (isValidPlacement(room, testPlacement, [], invalidator)) return testPlacement;
            testPlacement.sy = -1;
            if (isValidPlacement(room, testPlacement, [], invalidator)) return testPlacement;
            testPlacement.sx = 1;
            if (isValidPlacement(room, testPlacement, [], invalidator)) return testPlacement;
        }
    }

    return undefined;
}

//Returns true if all buildings do not cross over walls, or overlap in an illegal way
function isValidPlacement(
    room: Room,
    placed: PlacedStructureGroup,
    existingStructures: BuildableStructureConstant[][][],
    ...invalidators: ((coord: Coord) => boolean)[] //functions that return true to invalidate the square
): boolean {
    let terrain = room.getTerrain();
    for (let structureType of Object.keys(placed.group.buildings)) {
        for (let pos of Object.values(placed.group.buildings[structureType].pos)) {
            let roomCoord: Coord = { x: pos.x * placed.sx + placed.dx, y: pos.y * placed.sy + placed.dy };
            let plannedHere: BuildableStructureConstant[] = existingStructures[roomCoord.y]?.[roomCoord.x] ?? [];

            if (
                roomCoord.x <= 1 ||
                roomCoord.x >= 49 ||
                roomCoord.y <= 1 ||
                roomCoord.y >= 49 ||
                _.any(invalidators, i => i(roomCoord)) ||
                terrain.get(roomCoord.x, roomCoord.y) === TERRAIN_MASK_WALL ||
                _.any(plannedHere, s => !isWalkableOwnedRoom(s))
            ) {
                return false;
            }
        }
    }

    return true;
}
