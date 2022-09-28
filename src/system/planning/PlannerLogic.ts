// import { map } from "lodash";
// import { findPositionsInsideRect, floodFill } from "utils/algorithms/FloodFill";
// import { Log } from "utils/logger/Logger";
// import { PriorityQueue, PriorityQueueItem } from "utils/PriorityQueue";
// import { findStructure } from "utils/StructureFindCache";
// import { isWalkableOwnedRoom, manhattanDistance } from "utils/UtilityFunctions";
// import { EXTENSION_GROUP as EXTENSION_POD_GROUP } from "./stamp/ExtensionPod";
// import { FAST_FILLER_GROUP } from "./stamp/FastFiller";
// import { STORAGE_CORE_GROUP } from "./stamp/StorageCore";

// export function drawStructureGroup(visual: RoomVisual, group: StructureGroup) {
//     for (let building in group.buildings) {
//         let coords = group.buildings[building]!.pos;
//         coords.forEach(c => visual.structure(c.x, c.y, building as BuildableStructureConstant, {}));
//     }
// }

// export function drawPlacedStructureGroup(visual: RoomVisual, placed?: PlacedStructureGroup) {
//     if (!placed) return;
//     for (let building in placed.group[8].buildings) {
//         let coords = placed.group[8].buildings[building]!.pos;
//         coords.forEach(c =>
//             visual.structure(
//                 c.x * placed.sx + placed.dx,
//                 c.y * placed.sy + placed.dy,
//                 building as BuildableStructureConstant,
//                 {}
//             )
//         );
//     }
// }

// export function planStructures(
//     roomName: string,
//     lagoonFlow: CostMatrix,
//     controllerPos: RoomPosition,
//     exitCoords: Coord[]
// ): PlannedRoom {
//     //First flood fill from the controller to get available positions.
//     let controllerMatrix = floodFill(roomName, [controllerPos], undefined, undefined, false);

//     //Second, flood fill from the edges so we can sort out places too close to edges.
//     //We need to flood fill because being near to edges is fine as long as we aren't also near to exits
//     let edgeMatrix = floodFill(roomName, exitCoords, undefined, undefined, false);

//     //This is a mapping of which structures we have decided to place and where they will go.
//     let plannedStructures: BuildableStructureConstant[][][] = [];
//     let storageCore: PlacedStructureGroup | undefined;
//     let fastFiller: PlacedStructureGroup | undefined;
//     let storagePos: RoomPosition | undefined;

//     let spawns = findStructure(Game.rooms[roomName], FIND_MY_SPAWNS);
//     if (spawns.length > 1) {
//         Log.e(`Room ${roomName} is too advanced to run the room planner on. Has ${spawns.length} spawns!`);
//     } else if (spawns.length === 1) {
//         fastFiller = placeFastFiller(
//             controllerPos,
//             storagePos,
//             controllerMatrix,
//             edgeMatrix,
//             lagoonFlow,
//             plannedStructures
//         );
//         if (fastFiller) {
//             compileGrid(fastFiller!, plannedStructures);
//         }
//     }

//     //Place the storage core first
//     storageCore = placeStorageCore(controllerPos, controllerMatrix, edgeMatrix, lagoonFlow, plannedStructures);
//     if (!storageCore) {
//         Log.w(`Failed to place storage core in room: ${roomName}`);
//         return { score: 0 };
//     }
//     compileGrid(storageCore!, plannedStructures);
//     storagePos = new RoomPosition(storageCore.sx + storageCore.dx, storageCore.sy + storageCore.dy, roomName);

//     //Place the fast filler station
//     fastFiller = placeFastFiller(
//         controllerPos,
//         storagePos,
//         controllerMatrix,
//         edgeMatrix,
//         lagoonFlow,
//         plannedStructures
//     );
//     if (!fastFiller) {
//         Log.w(`Failed to place fast filler in room: ${roomName}`);
//         return { score: 0 };
//     }
//     compileGrid(fastFiller!, plannedStructures);

//     //Get number of extensions we have placed so far
//     let remainingExtensions =
//         CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][8] -
//         //Number of extensions in the storage core
//         (storageCore.group[8].buildings[STRUCTURE_EXTENSION]?.pos ?? []).length -
//         //Number of extensions we have in the fast filler
//         (fastFiller.group[8].buildings[STRUCTURE_EXTENSION]?.pos ?? []).length;

//     let pods = placeExtensionStamps(controllerPos, storagePos, controllerMatrix, edgeMatrix, plannedStructures, 40);

//     let extensions = placeFloodExtensions(storagePos, controllerMatrix, edgeMatrix, plannedStructures, 15);
//     //TODO still needs to do the following:
//     //Place the walls with mincut
//     //Get number of towers we have placed so far
//     //Place the remaining towers as close to the average ramp position as possible

//     return {
//         score: 100, //TODO find a way to score it
//         storageCore: storageCore!,
//         fastFiller: fastFiller,
//         extensionPods: pods,
//         extensions: extensions
//     };
// }
// interface ScoredCoord extends Coord, PriorityQueueItem {
//     score: number; //Lower is better
//     queueIndex: number;
// }

// const MIN_EDGE_DISTANCE = 6;
// const MIN_CONTROLLER_DISTANCE = 4;
// const MIN_CONTROLLER_RANGE = 4;

// export function placeStorageCore(
//     controllerPos: RoomPosition,
//     controllerMatrix: CostMatrix,
//     edgeMatrix: CostMatrix,
//     lagoonMatrix: CostMatrix,
//     plannedStructures: BuildableStructureConstant[][][]
// ): PlacedStructureGroup | undefined {
//     let possibleCoords: PriorityQueue<ScoredCoord> = getPossiblePositions(
//         controllerMatrix,
//         edgeMatrix,
//         plannedStructures,
//         (x: number, y: number) => lagoonMatrix.get(x, y)
//     );

//     let invalidator = (coord: Coord): boolean => {
//         return (
//             edgeMatrix.get(coord.x, coord.y) < MIN_EDGE_DISTANCE ||
//             manhattanDistance(coord.x, coord.y, controllerPos.x, controllerPos.y) < MIN_CONTROLLER_RANGE
//         );
//     };

//     return placeStructureGroup(controllerPos.roomName, STORAGE_CORE_GROUP, possibleCoords, invalidator);
// }

// export function placeFastFiller(
//     controllerPos: RoomPosition,
//     storagePos: RoomPosition | undefined,
//     controllerMatrix: CostMatrix,
//     edgeMatrix: CostMatrix,
//     lagoonFlow: CostMatrix,
//     plannedStructures: BuildableStructureConstant[][][]
// ) {
//     let possibleCoords: PriorityQueue<ScoredCoord> = getPossiblePositions(
//         controllerMatrix,
//         edgeMatrix,
//         plannedStructures,
//         (x: number, y: number) => storagePos?.getRangeTo(x, y) ?? lagoonFlow.get(x, y)
//     );

//     let invalidator = (coord: Coord): boolean => {
//         return (
//             edgeMatrix.get(coord.x, coord.y) < MIN_EDGE_DISTANCE ||
//             manhattanDistance(coord.x, coord.y, controllerPos.x, controllerPos.y) < MIN_CONTROLLER_RANGE ||
//             //Don't put unwalkable structures ontop of other unwalkable structures
//             _.any(plannedStructures[coord.y]?.[coord.x] ?? [], s => !isWalkableOwnedRoom(s))
//         );
//     };
//     return placeStructureGroup(controllerPos.roomName, FAST_FILLER_GROUP, possibleCoords, invalidator);
// }

// function placeFloodExtensions(
//     storagePos: RoomPosition,
//     controllerMatrix: CostMatrix,
//     edgeMatrix: CostMatrix,
//     plannedStructures: BuildableStructureConstant[][][],
//     remainingExtensions: number
// ): PlacedStructureGroup | undefined {
//     let ourExtensionCoords: Coord[] = [];
//     let ourRoadCoords: Coord[] = [];

//     let roadMatrix: CostMatrix = new PathFinder.CostMatrix();
//     let extensionMatrix: CostMatrix = new PathFinder.CostMatrix();
//     let blockingMatrix: CostMatrix = new PathFinder.CostMatrix();

//     let terrain = Game.map.getRoomTerrain(storagePos.roomName);

//     //Load up our matrixes
//     for (let y = 1; y < 49; y++) {
//         for (let x = 1; x < 49; x++) {
//             let planned: BuildableStructureConstant[] = plannedStructures[y]?.[x] ?? [];
//             if (terrain.get(x, y) === TERRAIN_MASK_WALL || _.any(planned, p => !isWalkableOwnedRoom(p)))
//                 blockingMatrix.set(x, y, 1);
//             if (planned.includes(STRUCTURE_EXTENSION)) extensionMatrix.set(x, y, 1);
//             if (planned.includes(STRUCTURE_ROAD)) roadMatrix.set(x, y, 1);
//         }
//     }

//     //Flood fill out from storage pos using roads alternating between road mode and extension mode
//     while (remainingExtensions > 0) {
//         let roadPos = floodPlace(
//             true,
//             storagePos,
//             roadMatrix,
//             extensionMatrix,
//             blockingMatrix,
//             controllerMatrix,
//             edgeMatrix
//         );
//         let extensionPos = floodPlace(
//             false,
//             storagePos,
//             roadMatrix,
//             extensionMatrix,
//             blockingMatrix,
//             controllerMatrix,
//             edgeMatrix
//         );
//         if (!roadPos && !extensionPos) {
//             return undefined;
//         }
//         if (roadPos) ourRoadCoords.push(roadPos);
//         if (extensionPos) ourExtensionCoords.push(extensionPos);
//         remainingExtensions--;
//     }

//     let emptyGroup: StructureGroup = {
//         rcl: 0,
//         buildings: {}
//     };
//     let group: StructureGroup = {
//         rcl: 0,
//         buildings: {
//             extension: {
//                 pos: ourExtensionCoords
//             },
//             road: {
//                 pos: ourRoadCoords
//             }
//         }
//     };

//     let groupByRCL: StructureGroup[] = [];
//     groupByRCL[1] = emptyGroup;
//     groupByRCL[2] = Object.assign({}, emptyGroup);
//     groupByRCL[3] = Object.assign({}, emptyGroup);
//     groupByRCL[4] = group;
//     groupByRCL[5] = Object.assign({}, group);
//     groupByRCL[6] = Object.assign({}, group);
//     groupByRCL[7] = Object.assign({}, group);
//     groupByRCL[8] = Object.assign({}, group);

//     let placedGroup: PlacedStructureGroup = { dx: 0, dy: 0, sx: 1, sy: 1, group: groupByRCL };
//     for (let i = 1; i <= 8; i++) placedGroup.group[i].rcl = i;

//     return placedGroup;
// }

// function floodPlace(
//     placingRoads: boolean,
//     storagePos: RoomPosition,
//     roadMatrix: CostMatrix,
//     extensionMatrix: CostMatrix,
//     blockingMatrix: CostMatrix,
//     controllerMatrix: CostMatrix,
//     edgeMatrix: CostMatrix
// ): Coord | undefined {
//     let toExplore: Coord[] = findPositionsInsideRect(
//         storagePos.x - 1,
//         storagePos.y - 1,
//         storagePos.x + 1,
//         storagePos.y + 1
//     );
//     let visited: CostMatrix = new PathFinder.CostMatrix();
//     // Log.d(`Attempting flood place. Roads:${placingRoads}`);
//     while (toExplore.length) {
//         let pos = toExplore.splice(0, 1)[0];
//         let x = pos.x;
//         let y = pos.y;
//         visited.set(x, y, 1);

//         // Log.d(`\tIterating on x:${x} y:${y}`);

//         //Dont bother with places next to the controller or edges
//         if (controllerMatrix.get(x, y) < MIN_CONTROLLER_DISTANCE || edgeMatrix.get(x, y) < MIN_EDGE_DISTANCE) continue;

//         let neighboors = findPositionsInsideRect(x - 1, y - 1, x + 1, y + 1);
//         //We found an open place. Try to place a road
//         if (placingRoads && roadMatrix.get(x, y) === 0 && blockingMatrix.get(x, y) === 0) {
//             let nearbyRoads = neighboors.filter(p => roadMatrix.get(p.x, p.y) === 1);
//             let nearbyExtensions = neighboors.filter(p => extensionMatrix.get(p.x, p.y) === 1);

//             // Log.d(`\tFound open space for road. Roads: ${nearbyRoads.length} Extensions: ${nearbyExtensions.length}`);
//             if (nearbyRoads.length > 0 && nearbyExtensions.length > 1) {
//                 roadMatrix.set(x, y, 1);
//                 return pos;
//             }
//         }
//         //We found an open place. Try to place an extension
//         else if (!placingRoads && roadMatrix.get(x, y) === 0 && blockingMatrix.get(x, y) === 0) {
//             let nearbyRoads = neighboors.filter(p => roadMatrix.get(p.x, p.y) === 1);
//             // Log.d(`\tFound open space for extension. Roads: ${nearbyRoads.length}`);
//             if (nearbyRoads.length > 0) {
//                 extensionMatrix.set(x, y, 1);
//                 blockingMatrix.set(x, y, 1);
//                 return pos;
//             }
//         }

//         //We landed on a road. Propigate our neighbors
//         else if (roadMatrix.get(x, y) === 1 && blockingMatrix.get(x, y) === 0) {
//             let nextGen = neighboors.filter(p => visited.get(p.x, p.y) === 0 && blockingMatrix.get(p.x, p.y) === 0);
//             // Log.d(`\tAdding ${nextGen.length} to the queue`);
//             toExplore.push(...nextGen);
//         }
//     }

//     return undefined;
// }

// function placeExtensionStamps(
//     controllerPos: RoomPosition,
//     storagePos: RoomPosition,
//     controllerMatrix: CostMatrix,
//     edgeMatrix: CostMatrix,
//     plannedStructures: BuildableStructureConstant[][][],
//     remainingExtensions: number
// ): PlacedStructureGroup[] | undefined {
//     //Get possible positions
//     let possibleCoords: PriorityQueue<ScoredCoord> = getPossiblePositions(
//         controllerMatrix,
//         edgeMatrix,
//         plannedStructures,
//         (x: number, y: number) => storagePos.getRangeTo(x, y)
//     );

//     let invalidator = (coord: Coord): boolean => {
//         return (
//             edgeMatrix.get(coord.x, coord.y) < MIN_EDGE_DISTANCE ||
//             manhattanDistance(coord.x, coord.y, controllerPos.x, controllerPos.y) < MIN_CONTROLLER_RANGE
//         );
//     };

//     let podsToPlace = Math.floor(remainingExtensions / 5);
//     let pods: PlacedStructureGroup[] = [];
//     while (possibleCoords.length > 0 && pods.length < podsToPlace) {
//         let nextPod = placeStructureGroup(
//             controllerPos.roomName,
//             EXTENSION_POD_GROUP,
//             possibleCoords,
//             invalidator,
//             false
//         );
//         if (nextPod) {
//             compileGrid(nextPod, plannedStructures);
//             pods.push(nextPod);
//         } else {
//             Log.d(`Failed to place extension pod. Pods remaining: ${podsToPlace - pods.length}`);
//             return undefined;
//         }
//     }

//     //TODO place remaining extensions...
//     return pods;
// }

// export function placeStructureGroup(
//     roomName: string,
//     toPlace: StructureGroup[],
//     possibleCoords: PriorityQueue<ScoredCoord>,
//     invalidator: (coord: Coord) => boolean,
//     tryReflections: boolean = true
// ): PlacedStructureGroup | undefined {
//     // Log.d(`Trying to place using ${possibleCoords.length} places`);
//     let terrain = Game.map.getRoomTerrain(roomName);

//     let allPositions = Object.values(toPlace[8].buildings ?? {})
//         .map(b => b.pos)
//         .reduce((acc, val) => acc.concat(val), []);

//     let stampXOffset = Math.floor((_.max(allPositions, c => c.x).x - _.min(allPositions, c => c.x).x) / 2);
//     let stampYOffset = Math.floor((_.max(allPositions, c => c.y).y - _.min(allPositions, c => c.y).y) / 2);

//     while (possibleCoords.length > 0) {
//         let testPosition = possibleCoords.dequeue()!;

//         // if(testPosition.score < 10)
//         //     Log.d("Testing " + JSON.stringify(testPosition));

//         let testPlacement: PlacedStructureGroup = {
//             dx: testPosition.x - stampXOffset,
//             dy: testPosition.y - stampYOffset,
//             sx: 1,
//             sy: 1,
//             group: toPlace
//         };
//         if (isValidPlacement(terrain, testPlacement, [], invalidator)) return testPlacement;
//         if (tryReflections) {
//             testPlacement.sx = -1;
//             if (isValidPlacement(terrain, testPlacement, [], invalidator)) return testPlacement;
//             testPlacement.sy = -1;
//             if (isValidPlacement(terrain, testPlacement, [], invalidator)) return testPlacement;
//             testPlacement.sx = 1;
//             if (isValidPlacement(terrain, testPlacement, [], invalidator)) return testPlacement;
//         }
//     }
//     return undefined;
// }

// function compileGrid(newGroup: PlacedStructureGroup, existing: BuildableStructureConstant[][][]) {
//     for (let building in newGroup.group[8].buildings) {
//         let positions = newGroup.group[8].buildings[building].pos;
//         positions.forEach(p => {
//             let x = p.x * newGroup.sx + newGroup.dx;
//             let y = p.y * newGroup.sy + newGroup.dy;
//             if (!existing[y]) existing[y] = [];
//             if (!existing[y][x]) existing[y][x] = [];
//             existing[y][x].push(building as BuildableStructureConstant);
//         });
//     }
// }

// function getPossiblePositions(
//     controllerMatrix: CostMatrix,
//     edgeMatrix: CostMatrix,
//     plannedStructures: BuildableStructureConstant[][][],
//     scoreFunction: (x: number, y: number) => number
// ): PriorityQueue<ScoredCoord> {
//     //Don't consider everything... that would be a lot
//     let possibleCoords: PriorityQueue<ScoredCoord> = new PriorityQueue(49 * 49, (a, b) => a.score - b.score);
//     for (let y = 2; y < 48; y++) {
//         for (let x = 2; x < 48; x++) {
//             if (
//                 controllerMatrix.get(x, y) >= MIN_CONTROLLER_DISTANCE &&
//                 edgeMatrix.get(x, y) >= MIN_EDGE_DISTANCE &&
//                 !_.any(plannedStructures[y]?.[x] ?? [], s => !isWalkableOwnedRoom(s))
//             ) {
//                 possibleCoords.enqueue({
//                     x: x,
//                     y: y,
//                     score: scoreFunction(x, y),
//                     queueIndex: 0 //Will get overwritten
//                 });
//                 //Break out early
//                 if (possibleCoords.length === possibleCoords.capacity) return possibleCoords;
//             }
//         }
//     }
//     return possibleCoords;
// }

// //Returns true if all buildings do not cross over walls, or overlap in an illegal way
// function isValidPlacement(
//     terrain: RoomTerrain,
//     placed: PlacedStructureGroup,
//     existingStructures: BuildableStructureConstant[][][],
//     ...invalidators: ((coord: Coord) => boolean)[] //functions that return true to invalidate the square
// ): boolean {
//     for (let structureType of Object.keys(placed.group[8].buildings)) {
//         for (let pos of Object.values(placed.group[8].buildings[structureType].pos)) {
//             let roomCoord: Coord = {
//                 x: pos.x * placed.sx + placed.dx,
//                 y: pos.y * placed.sy + placed.dy
//             };
//             let plannedHere: BuildableStructureConstant[] = existingStructures[roomCoord.y]?.[roomCoord.x] ?? [];

//             if (
//                 roomCoord.x <= 1 ||
//                 roomCoord.x >= 49 ||
//                 roomCoord.y <= 1 ||
//                 roomCoord.y >= 49 ||
//                 _.any(invalidators, i => i(roomCoord)) ||
//                 terrain.get(roomCoord.x, roomCoord.y) === TERRAIN_MASK_WALL ||
//                 _.any(plannedHere, s => !isWalkableOwnedRoom(s))
//             ) {
//                 // Log.d(JSON.stringify(roomCoord) + " is invalid");
//                 return false;
//             }
//         }
//     }

//     return true;
// }
