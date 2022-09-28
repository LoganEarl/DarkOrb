import { getRoomData } from "system/scouting/ScoutInterface";
import { floodFill } from "utils/algorithms/FloodFill";
import { LagoonDetector } from "utils/algorithms/LagoonFlow";
import { FEATURE_VISUALIZE_PLANNING } from "utils/featureToggles/FeatureToggleConstants";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { unpackCoordList, unpackPosList } from "utils/Packrat";
import { PriorityQueue, PriorityQueueItem } from "utils/PriorityQueue";
import {
    clone2DArray,
    findPositionsInsideRect,
    getFreeSpacesNextTo,
    isWalkableOwnedRoom,
    rotateMatrix
} from "utils/UtilityFunctions";
import { FAST_FILLER_GROUP, FAST_FILLER_SPAWN_COORD } from "./stamp/FastFiller";
import { rotateGroup } from "./stamp/StampLogic";
import { STORAGE_CORE_GROUP } from "./stamp/StorageCore";

type PlanningState =
    | "New"
    | "ReservingSpaces"
    | "PlacingFillerUsingSpawn" //We do this when we just spawned and we want to build the filler around the spawn
    | "RunningLagoonFlow"
    | "PlacingCore"
    | "PlacingFiller"
    | "PlacingExtensionStamps"
    | "CreatingMiningRoutes"
    | "PlacingWalls"
    | "Failed"
    | "Done";

interface ScoredCoord extends Coord, PriorityQueueItem {
    score: number; //Lower is better
    queueIndex: number;
}

const MIN_EDGE_DISTANCE = 5;
const LAGOON_FLOW_ITERATIONS_PER_TICK = 5;

export class RoomPlanner implements PriorityQueueItem {
    public queueIndex: number = 0; //Ignore this
    public roomName: string;
    public roomDepth: number;

    private terrain: RoomTerrain;
    private roomData: RoomScoutingInfo;
    private exitCoords: Coord[];
    private controllerPos: RoomPosition;
    private spawnPosition: RoomPosition | undefined;
    private failReason: string | undefined;

    //Stores all tiles that we forbid building blocking structures on (not ramps)
    private forbiddenMatrix: CostMatrix | undefined;
    //Stores the planned positions of all roads. 1 == road, 2 == plain, 4 == swamp, 255 == wall
    private roadMatrix: CostMatrix | undefined;
    //Stores all blocking structures and walls
    private blockingMatrix: CostMatrix | undefined;
    //Stores lagoon info used to find good places to build
    private lagoonMatrix: CostMatrix | undefined;
    private laggonDetector: LagoonDetector;

    private placedFastFiller: PlacedStructureGroup | undefined;
    private placedStorageCore: PlacedStructureGroup | undefined;

    private planningState: PlanningState = "ReservingSpaces";

    constructor(room: Room, roomData: RoomScoutingInfo) {
        this.roomName = room.name;
        this.terrain = room.getTerrain();
        this.exitCoords = room.find(FIND_EXIT).map(e => e.localCoords);
        this.controllerPos = room.controller!.pos;
        this.roomData = roomData;
        this.roomDepth = roomData.territoryInfo[0].range;
        this.laggonDetector = new LagoonDetector(room, 100);

        let spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 1) this.spawnPosition = spawns[0].pos;
        else if (spawns.length > 1) this.fail("Room too advanced for replanning");
    }

    public continuePlanning(): PlannedRoom | undefined {
        if (this.planningState === "ReservingSpaces") {
            this.loadTerrainData();
            this.reserveSpaces();
            if (this.spawnPosition) this.planningState = "PlacingFillerUsingSpawn";
            else this.planningState = "RunningLagoonFlow";
        } else if (this.planningState === "PlacingFillerUsingSpawn") {
            this.placeFillerUsingSpawn();
            this.planningState = "RunningLagoonFlow";
        } else if (this.planningState === "RunningLagoonFlow") {
            let matrix = this.runLagoonFlow();
            if (matrix) {
                this.lagoonMatrix = matrix;
                this.planningState = "PlacingCore";
            }
        } else if (this.planningState === "PlacingCore") {
            this.placeStorageCore();
            if (this.placedStorageCore && !this.placedFastFiller) {
                this.planningState = "PlacingFiller";
            } else if (this.placedStorageCore) {
                this.planningState = "PlacingExtensionStamps";
            }
        }

        new RoomVisual(this.roomName).text(this.planningState, 1, 1, { align: "left" });

        return undefined;
    }

    private loadTerrainData() {
        let blockingMatrix = new PathFinder.CostMatrix();
        let roadMatrix = new PathFinder.CostMatrix();
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (this.terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    blockingMatrix.set(x, y, 255);
                    roadMatrix.set(x, y, 255);
                } else if (this.terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                    roadMatrix.set(x, y, 4);
                } else {
                    roadMatrix.set(x, y, 2);
                }
            }
        }

        if (getFeature(FEATURE_VISUALIZE_PLANNING)) {
            drawRoadMatrix(new RoomVisual(this.roomName), roadMatrix);
        }

        this.blockingMatrix = blockingMatrix;
        this.roadMatrix = roadMatrix;
    }

    private reserveSpaces() {
        if (!this.roomData.miningInfo) return this.fail("Unable to plan without mining info");

        //Block off areas next to exits
        let forbiddenMatrix = floodFill(this.roomName, this.exitCoords, undefined, undefined, false);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (this.terrain.get(x, y) !== TERRAIN_MASK_WALL && forbiddenMatrix.get(x, y) < MIN_EDGE_DISTANCE)
                    forbiddenMatrix.set(x, y, 255);
                else forbiddenMatrix.set(x, y, 0);
            }
        }

        //Block off spaces next to sources
        this.roomData.miningInfo!.sources.forEach(s => {
            let freeSpots = unpackCoordList(s.packedFreeSpots);
            freeSpots.forEach(p => forbiddenMatrix.set(p.x, p.y, 255));
        });

        //Block off spaces next to mineral
        let spots = unpackCoordList(this.roomData.miningInfo.mineral.packedFreeSpots);
        spots.forEach(p => forbiddenMatrix.set(p.x, p.y, 255));

        //Block off spaces inside range 2 of the controller
        findPositionsInsideRect(
            this.controllerPos.x - 2,
            this.controllerPos.y - 2,
            this.controllerPos.x + 2,
            this.controllerPos.y + 2
        ).forEach(p => {
            if (this.terrain.get(p.x, p.y) !== TERRAIN_MASK_WALL) {
                forbiddenMatrix.set(p.x, p.y, 255);
            }
        });

        if (getFeature(FEATURE_VISUALIZE_PLANNING)) {
            drawForbiddenMatrix(new RoomVisual(this.roomName), forbiddenMatrix);
        }

        this.forbiddenMatrix = forbiddenMatrix;
    }

    private placeFillerUsingSpawn() {
        if (this.spawnPosition) {
            //We don't rotate the fast filler ever. Makes spawning fillers annoying
            let buildings = FAST_FILLER_GROUP[8].buildings;
            let stampX = this.spawnPosition.x - FAST_FILLER_SPAWN_COORD.x;
            let stampY = this.spawnPosition.y - FAST_FILLER_SPAWN_COORD.y;
            if (!this.place({ x: stampX, y: stampY }, buildings)) this.fail("Bad spawn position");
            else {
                this.placedFastFiller = {
                    dx: stampX,
                    dy: stampY,
                    group: FAST_FILLER_GROUP
                };
            }

            if (getFeature(FEATURE_VISUALIZE_PLANNING)) {
                let visual = new RoomVisual(this.roomName);
                drawPlacedStructureGroup(visual, this.placedFastFiller);
                visual.connectRoads({});
                drawRoadMatrix(visual, this.roadMatrix!);
                drawBlockedMatrix(visual, this.blockingMatrix!);
            }
        }
    }

    private runLagoonFlow(): CostMatrix | undefined {
        let lagoonMatrix: CostMatrix | undefined;
        for (let i = 0; i < LAGOON_FLOW_ITERATIONS_PER_TICK && !lagoonMatrix; i++) {
            lagoonMatrix = this.laggonDetector.advanceFlow();
        }

        if (getFeature(FEATURE_VISUALIZE_PLANNING)) {
            let visual = new RoomVisual(this.roomName);
            this.laggonDetector.visualize(visual);
            drawPlacedStructureGroup(visual, this.placedFastFiller);
            visual.connectRoads({});
        }

        return lagoonMatrix;
    }

    private placeStorageCore() {
        let placementOptions: PriorityQueue<ScoredCoord> = new PriorityQueue(49 * 49, (a, b) => a.score - b.score);
        let checkedCoords: Coord[] = [];

        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (this.blockingMatrix?.get(x, y) === 0 && this.forbiddenMatrix?.get(x, y) === 0) {
                    placementOptions.enqueue({ x: x, y: y, score: this.lagoonMatrix!.get(x, y), queueIndex: 0 });
                }
            }
        }

        let placedPos: Coord | undefined;
        let placedRotation: 0 | 1 | 2 | 3 = 0;
        let toPlace: BuildableStructureConstant[][][] = clone2DArray(STORAGE_CORE_GROUP[8].buildings);
        //We rotate the item multiple times and try to place it in each orientation
        while (!placedPos && placementOptions.length) {
            let pos = placementOptions.dequeue()!;
            checkedCoords.push(pos);
            for (let rotations = 0; rotations < 4; rotations++) {
                if (this.place(pos, toPlace)) {
                    placedPos = pos;
                    placedRotation = rotations as 0 | 1 | 2 | 3;
                }
                rotateMatrix(toPlace);
            }
        }

        if (placedPos) {
            this.placedStorageCore = {
                dx: placedPos.x,
                dy: placedPos.y,
                group: rotateGroup(STORAGE_CORE_GROUP, placedRotation)
            };
        } else this.fail("Couldn't find a place for the storage core");

        if (getFeature(FEATURE_VISUALIZE_PLANNING)) {
            let visual = new RoomVisual(this.roomName);
            drawPlacedStructureGroup(visual, this.placedFastFiller);
            drawPlacedStructureGroup(visual, this.placedStorageCore);
            drawForbiddenMatrix(visual, this.forbiddenMatrix!);
            fillCoords(visual, checkedCoords);
            visual.connectRoads({});
        }
    }

    private place(upperLeft: Coord, group: BuildableStructureConstant[][][]): boolean {
        group = clone2DArray(group);
        let dx = upperLeft.x;
        let dy = upperLeft.y;

        for (let y = 0; y < group.length; y++) {
            if (y + dy < 0 || y + dy >= 50) return false;
            for (let x = 0; x < group[y].length; x++) {
                if (x + dx < 0 || x + dx >= 50) return false;
                let blocking = _.any(group[y][x], b => !isWalkableOwnedRoom(b));
                if (blocking && this.forbiddenMatrix?.get(x + dx, y + dy) === 255) return false;
                if (this.blockingMatrix?.get(x + dx, y + dy) === 255) return false;
            }
        }

        //If we got this far, we are safe to place it down
        for (let y = 0; y < group.length; y++) {
            for (let x = 0; x < group[y].length; x++) {
                let blocking = _.any(group[y][x], b => !isWalkableOwnedRoom(b));
                if (blocking) this.blockingMatrix?.set(x + dx, y + dy, 255);
                let hasRoad = _.any(group[y][x], b => b === STRUCTURE_ROAD);
                if (hasRoad) this.roadMatrix?.set(x + dx, y + dy, 1);
            }
        }

        return true;
    }

    private fail(reason: string): void {
        this.failReason = reason;
        this.planningState = "Failed";
    }
}

export function drawPlacedStructureGroup(visual: RoomVisual, placed?: PlacedStructureGroup) {
    if (!placed) return;
    let buildings = placed.group[8].buildings;
    for (let y = 0; y < buildings.length; y++) {
        for (let x = 0; x < buildings[y].length; x++) {
            for (let type of buildings[y][x]) {
                visual.structure(x + placed.dx, y + placed.dy, type, {});
            }
        }
    }
}

function drawRoadMatrix(visual: RoomVisual, matrix: CostMatrix) {
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            let color = "white";
            let result = matrix.get(x, y);
            if (result === 255) color = "red";
            if (result === 4) color = "yellow";
            if (result === 2) color = "green";
            visual.rect(x - 0.5, y - 0.5, 1, 1, {
                fill: color,
                opacity: 0.4
            });
        }
    }
}

function drawForbiddenMatrix(visual: RoomVisual, matrix: CostMatrix) {
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (matrix.get(x, y) === 255) {
                visual.rect(x - 0.5, y - 0.5, 1, 1, {
                    fill: "red",
                    opacity: 0.4
                });
            }
        }
    }
}

function drawBlockedMatrix(visual: RoomVisual, matrix: CostMatrix) {
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (matrix.get(x, y) === 255) {
                visual.rect(x - 0.5, y - 0.5, 1, 1, {
                    fill: "black",
                    opacity: 0.4
                });
            }
        }
    }
}

function drawLagoonMatrix(visual: RoomVisual, matrix: CostMatrix) {
    for (let y = 0; y <= 49; y++) {
        for (let x = 0; x <= 49; x++) {
            if (matrix.get(x, y) != 0) {
                visual.rect(x - 0.5, y - 0.5, 1, 1, {
                    fill: "hsl(" + (matrix.get(x, y) / 255) * 320 + ", 100%, 60%)",
                    opacity: 0.4
                });
            }
        }
    }
}

function fillCoords(visual: RoomVisual, coords: Coord[]) {
    for (let i = 0; i < coords.length; i++) {
        let x = coords[i].x;
        let y = coords[i].y;
        visual.rect(x - 0.5, y - 0.5, 1, 1, {
            fill: "hsl(" + (i / coords.length) * 320 + ", 100%, 60%)",
            opacity: 0.4
        });
    }
}
