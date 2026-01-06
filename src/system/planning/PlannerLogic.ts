import {floodFill} from "utils/algorithms/FloodFill";
import {LagoonDetector} from "utils/algorithms/LagoonFlow";
import {getCutTiles, Rectangle} from "utils/algorithms/MinCut";
import {FEATURE_VISUALIZE_PLANNING} from "utils/featureToggles/FeatureToggleConstants";
import {shouldVisualize} from "utils/featureToggles/FeatureToggles";
import {Log} from "utils/logger/Logger";
import {unpackCoordList, unpackPos} from "utils/Packrat";
import {PriorityQueue, PriorityQueueItem} from "utils/PriorityQueue";
import {
    clamp,
    clone2DArray,
    euclidianDistance,
    findPositionsInsideRect,
    insertSorted,
    isWalkableOwnedRoom,
    roomPos,
    rotateMatrix
} from "utils/UtilityFunctions";
import {EXTENSION_GROUP} from "./stamp/ExtensionPod";
import {FAST_FILLER_GROUP, FAST_FILLER_SPAWN_COORDS} from "./stamp/FastFiller";
import {deepCopyGroups, rotateGroup} from "./stamp/StampLogic";
import {STORAGE_CORE_GROUP} from "./stamp/StorageCore";
import {distanceTransformDiag} from "../../utils/algorithms/DistanceTransform";

type PlanningState =
    | "New"
    | "ReservingSpaces"
    | "PlacingFillerUsingSpawn" //We do this when we just spawned and we want to build the filler around the spawn
    | "RunningLagoonFlow"
    | "PlacingCore"
    | "BuildingStorageGradient"
    | "PlacingFiller"
    | "PlacingExtensionStamps"
    | "PlacingRoads"
    | "PlacingWalls"
    | "PlacingTowers"
    | "Failed"
    | "Done";

interface ScoredCoord extends Coord, PriorityQueueItem {
    score: number; //Lower is better
    queueIndex: number;
}

const MIN_EDGE_DISTANCE = 5;
const LAGOON_FLOW_ITERATIONS_PER_TICK = 5;
const ROWS_SCANNED_PER_TICK = 4;

export class RoomPlanner implements PriorityQueueItem {
    public queueIndex: number = 0; //Ignore this
    public roomName: string;
    public roomDepth: number;
    public failReason: string | undefined;

    private planningState: PlanningState = "ReservingSpaces";
    private terrain: RoomTerrain;
    private roomData: RoomScoutingInfo;
    private exitCoords: Coord[];
    private controllerPos: RoomPosition;
    private spawnPos: RoomPosition | undefined;
    private storagePos: RoomPosition | undefined;

    //Temporary variables used for calculations extending over multiple ticks
    private lastScannedY: number = 1;
    private scoredCoords: ScoredCoord[] = [];
    private scoredCoordComparator = (a: ScoredCoord, b: ScoredCoord) => a.score - b.score;

    //Stores all tiles that we forbid building blocking structures on (not ramps)
    private forbiddenMatrix: CostMatrix | undefined;
    //Stores the planned positions of all roads. 1 == road, 2 == plain, 4 == swamp, 255 == wall/placed structure
    private pathMatrix: CostMatrix | undefined;
    //Stores lagoon info used to find good places to build
    private lagoonMatrix: CostMatrix | undefined;
    private laggonDetector: LagoonDetector;
    //Stores a sorted list of coords, sorted by path distance to the main storage
    private storageGradient: Coord[] | undefined;
    private placedFastFiller: PlacedStructureGroup | undefined;
    private placedStorageCore: PlacedStructureGroup | undefined;
    private placedExtensionPods: PlacedStructureGroup[] | undefined;
    private placedRoads: Coord[] | undefined;
    private placedWalls: Coord[] | undefined;
    private placedTowers: Coord[] | undefined;
    private placedUpgradeContainer: Coord | undefined;
    private upgraderPositions: Coord[] | undefined;

    constructor(room: Room, roomData: RoomScoutingInfo) {
        this.roomName = room.name;
        this.terrain = room.getTerrain();
        this.exitCoords = room.find(FIND_EXIT).map(e => e.localCoords);
        this.controllerPos = room.controller!.pos;
        this.roomData = roomData;
        this.roomDepth = roomData.territoryInfo.claims[0].range;
        this.laggonDetector = new LagoonDetector(room, 100);

        let spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 1) this.spawnPos = spawns[0].pos;
        else if (spawns.length > 1) this.fail("Room too advanced for replanning");
    }

    public continuePlanning(): PlannedRoom | undefined {
        if (this.planningState === "ReservingSpaces") {
            Log.i(`Started roomplanning in ${this.roomName}`);
            this.loadTerrainData();
            this.reserveSpaces();
            if (this.spawnPos) this.planningState = "PlacingFillerUsingSpawn";
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
            this.planningState = "BuildingStorageGradient";
        } else if (this.planningState === "BuildingStorageGradient") {
            this.buildStorageGradient();
            if (this.storageGradient && !this.placedFastFiller) {
                this.planningState = "PlacingFiller";
            } else if (this.storageGradient) {
                this.planningState = "PlacingExtensionStamps";
            }
        } else if (this.planningState === "PlacingFiller") {
            if (this.placeFiller()) this.planningState = "PlacingExtensionStamps";
        } else if (this.planningState === "PlacingExtensionStamps") {
            this.placeExtensionsPods();
            this.planningState = "PlacingRoads";
        } else if (this.planningState === "PlacingRoads") {
            if (this.placeRoadPaths()) this.planningState = "PlacingWalls";
        } else if (this.planningState === "PlacingWalls") {
            this.placeWalls();
            this.planningState = "PlacingTowers";
        } else if (this.planningState === "PlacingTowers") {
            this.placeTowers();
            this.planningState = "Done";
        } else if (this.planningState === "Done") {
            if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
                let visual = new RoomVisual(this.roomName);
                this.placedWalls!.forEach(pos => visual.structure(pos.x, pos.y, STRUCTURE_RAMPART, {}));
                this.placedExtensionPods!.forEach(p => drawPlacedStructureGroup(visual, p));
                drawPlacedStructureGroup(visual, this.placedStorageCore);
                drawPlacedStructureGroup(visual, this.placedFastFiller);
                for (let roadPos of this.placedRoads!) visual.structure(roadPos.x, roadPos.y, STRUCTURE_ROAD, {});
                visual.connectRoads();
            }
        }

        new RoomVisual(this.roomName).text(this.planningState, 1, 1, {align: "left"});

        if (this.planningState === "Done") {
            return {
                score: 50,
                storageCore: this.placedStorageCore,
                fastFiller: this.placedFastFiller,
                extensionPods: this.placedExtensionPods,
                roadPositions: this.placedRoads,
                towerPositions: this.placedTowers,
                wallPositions: this.placedWalls,
                upgraderPositions: this.upgraderPositions,
                upgradeContainerPos: this.placedUpgradeContainer
            };
        } else if (this.planningState === "Failed") {
            return {score: 0};
        } else return undefined;
    }

    private loadTerrainData() {
        let pathMatrix = new PathFinder.CostMatrix();
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (this.terrain.get(x, y) === TERRAIN_MASK_WALL) {
                    pathMatrix.set(x, y, 255);
                } else if (this.terrain.get(x, y) === TERRAIN_MASK_SWAMP) {
                    pathMatrix.set(x, y, 4);
                } else {
                    pathMatrix.set(x, y, 2);
                }
            }
        }

        if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
            drawPathMatrix(new RoomVisual(this.roomName), pathMatrix);
        }

        this.pathMatrix = pathMatrix;
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
        let cPoses = findPositionsInsideRect(
            this.controllerPos.x - 2,
            this.controllerPos.y - 2,
            this.controllerPos.x + 2,
            this.controllerPos.y + 2
        );

        //For each position in range 3 of the controller, which has the most unoccupied neighboors within range 3.

        let maxIndex = -1;
        let maxNeighboors: Coord[] = [];
        let maxScore = -1;
        let dtDiag = distanceTransformDiag(new PathFinder.CostMatrix());
        for (let i = 0; i < cPoses.length; i++) {
            let pos = cPoses[i];
            if (this.terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL) {
                let neighboors = findPositionsInsideRect(pos.x - 1, pos.y - 1, pos.x + 1, pos.y + 1).filter(
                    p => this.terrain.get(p.x, p.y) !== TERRAIN_MASK_WALL
                );
                //Slightly makes areas away from walls preferable. Helps with pathing
                let score = neighboors.length + dtDiag.get(pos.x, pos.y)/50.0;

                if (score > maxScore) {
                    maxIndex = i;
                    maxNeighboors = neighboors;
                    maxScore = score;
                }
            }
        }

        if (maxIndex != -1) {
            this.placedUpgradeContainer = cPoses[maxIndex];
            this.upgraderPositions = maxNeighboors;
        }

        for (let p of maxNeighboors) {
            forbiddenMatrix.set(p.x, p.y, 255);
        }

        if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
            drawForbiddenMatrix(new RoomVisual(this.roomName), forbiddenMatrix);
        }

        this.forbiddenMatrix = forbiddenMatrix;

        return true;
    }

    private placeFillerUsingSpawn() {
        if (this.spawnPos) {
            //We don't rotate the fast filler ever. Makes spawning fillers annoying
            let buildings = FAST_FILLER_GROUP[8].buildings;
            let stampX = this.spawnPos.x - FAST_FILLER_SPAWN_COORDS[0].x;
            let stampY = this.spawnPos.y - FAST_FILLER_SPAWN_COORDS[0].y;
            if (!this.place({x: stampX, y: stampY}, buildings)) this.fail("Bad spawn position");
            else {
                this.placedFastFiller = {
                    dx: stampX,
                    dy: stampY,
                    group: deepCopyGroups(FAST_FILLER_GROUP)
                };
            }

            if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
                let visual = new RoomVisual(this.roomName);
                drawPlacedStructureGroup(visual, this.placedFastFiller);
                visual.connectRoads();
                drawPathMatrix(visual, this.pathMatrix!);
            }
        }
    }

    private runLagoonFlow(): CostMatrix | undefined {
        let lagoonMatrix: CostMatrix | undefined;
        for (let i = 0; i < LAGOON_FLOW_ITERATIONS_PER_TICK && !lagoonMatrix; i++) {
            lagoonMatrix = this.laggonDetector.advanceFlow();
        }

        //Bias the lagoon flow toward our fast filler a bit
        if (lagoonMatrix && this.placedFastFiller) {
            for (let y = 1; y < 49; y++) {
                for (let x = 1; x < 49; x++) {
                    let offset = Math.floor(this.placedFastFiller.group[8].buildings.length / 2);
                    let euclidian = euclidianDistance(
                        x,
                        y,
                        this.placedFastFiller.dx + offset,
                        this.placedFastFiller.dy + offset
                    );
                    //max euclidian distance is 50, so being far away counts as up to 10 more flow value
                    let score = clamp(lagoonMatrix.get(x, y) / 2 + (euclidian * 5) / 3, 0, 255);
                    lagoonMatrix.set(x, y, score);
                }
            }
        }

        if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
            let visual = new RoomVisual(this.roomName);
            if (lagoonMatrix) drawLagoonMatrix(visual, lagoonMatrix);
            else this.laggonDetector.visualize(visual);
            drawPlacedStructureGroup(visual, this.placedFastFiller);
            visual.connectRoads();
        }

        return lagoonMatrix;
    }

    private placeStorageCore() {
        let placementOptions: PriorityQueue<ScoredCoord> = new PriorityQueue(49 * 49, (a, b) => a.score - b.score);
        let checkedCoords: Coord[] = [];

        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (this.pathMatrix?.get(x, y) !== 255 && this.forbiddenMatrix?.get(x, y) === 0) {
                    placementOptions.enqueue({
                        x: x,
                        y: y,
                        score: this.lagoonMatrix!.get(x, y),
                        queueIndex: 0
                    });
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
            for (let rotations = 0; rotations < 4 && !placedPos; rotations++) {
                let offset = this.placeCentered(pos, toPlace);
                if (offset !== false) {
                    placedPos = {x: pos.x - offset, y: pos.y - offset};
                    placedRotation = rotations as 0 | 1 | 2 | 3;
                } else rotateMatrix(toPlace);
            }
        }

        if (placedPos) {
            outer: for (let y = 0; y < toPlace.length; y++) {
                for (let x = 0; x < toPlace[y].length; x++) {
                    if (toPlace[y][x].includes(STRUCTURE_STORAGE)) {
                        this.storagePos = new RoomPosition(x + placedPos.x, y + placedPos.y, this.roomName);
                        break outer;
                    }
                }
            }

            //Fill in the middle of the structure. This will help with our E pod placement.
            this.pathMatrix?.set(placedPos.x + 3, placedPos.y + 3, 255);

            this.placedStorageCore = {
                dx: placedPos.x,
                dy: placedPos.y,
                group: rotateGroup(deepCopyGroups(STORAGE_CORE_GROUP), placedRotation)
            };
        } else this.fail("Couldn't find a place for the storage core");

        if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
            let visual = new RoomVisual(this.roomName);
            drawPathMatrix(visual, this.pathMatrix!);
            drawPlacedStructureGroup(visual, this.placedFastFiller);
            drawPlacedStructureGroup(visual, this.placedStorageCore);
            drawForbiddenMatrix(visual, this.forbiddenMatrix!);
            fillCoords(visual, checkedCoords);
            visual.connectRoads();
        }
    }

    private buildStorageGradient(): boolean {
        if (!this.storagePos) return this.fail("Unable to create storage gradient without a placed storage");
        if (!this.pathMatrix) return this.fail("Unable to process without pathing matrix");
        if (!this.forbiddenMatrix) return this.fail("Unable to process without forbidden matrix");

        let target = clamp(this.lastScannedY + ROWS_SCANNED_PER_TICK, 1, 49);
        let callback = (roomName: string) => (this.roomName === roomName ? this.pathMatrix! : false);
        while (this.lastScannedY < target) {
            let y = this.lastScannedY;
            this.lastScannedY++;
            for (let x = 1; x < 49; x++) {
                if (this.pathMatrix.get(x, y) !== 255 && this.forbiddenMatrix.get(x, y) === 0) {
                    let path = PathFinder.search(
                        new RoomPosition(x, y, this.roomName),
                        {pos: this.storagePos, range: 1},
                        {roomCallback: callback}
                    );

                    //Slightly prefer it when they are closer in euclidian terms. Serves as a tiebreaker
                    let euclidian = euclidianDistance(x, y, this.storagePos.x, this.storagePos.y);
                    let score = path.cost + clamp(euclidian / 100, 0, 0.9);

                    if (!path.incomplete) {
                        let coord: ScoredCoord = {x: x, y: y, score: score, queueIndex: 0};
                        this.scoredCoords = insertSorted(coord, this.scoredCoords, this.scoredCoordComparator);
                    }
                }
            }
        }

        //If we have filled every spot
        if (target === 49) {
            let results: Coord[] = [];
            while (this.scoredCoords.length > 0) results.push(this.scoredCoords.shift()!);
            this.storageGradient = results;
        }

        if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
            let visual = new RoomVisual(this.roomName);
            fillCoords(visual, this.storageGradient ?? this.scoredCoords);
            drawPlacedStructureGroup(visual, this.placedStorageCore);
            drawPlacedStructureGroup(visual, this.placedFastFiller);
            visual.connectRoads();
        }

        return true;
    }

    private placeFiller() {
        if (!this.storageGradient) return this.fail("Cannot place filler without storage gradient");

        let placedPos: Coord | undefined;
        let placedRotation: 0 | 1 | 2 | 3 = 0;
        let toPlace: BuildableStructureConstant[][][] = clone2DArray(FAST_FILLER_GROUP[8].buildings);
        let checkedCoords: Coord[] = [];

        //We rotate the item multiple times and try to place it in each orientation
        for (let i = 0; i < this.storageGradient.length; i++) {
            let pos = this.storageGradient[i];
            checkedCoords.push(pos);
            for (let rotations = 0; rotations < 4 && !placedPos; rotations++) {
                let offset = this.placeCentered(pos, toPlace);
                if (offset !== false) {
                    placedPos = {x: pos.x - offset, y: pos.y - offset};
                    placedRotation = rotations as 0 | 1 | 2 | 3;
                } else rotateMatrix(toPlace);
            }
        }

        if (placedPos) {
            this.placedFastFiller = {
                dx: placedPos.x,
                dy: placedPos.y,
                group: rotateGroup(deepCopyGroups(FAST_FILLER_GROUP), placedRotation)
            };
        } else {
            return this.fail("Unable to place fast filler");
        }

        if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
            let visual = new RoomVisual(this.roomName);
            drawPlacedStructureGroup(visual, this.placedFastFiller);
            drawPlacedStructureGroup(visual, this.placedStorageCore);
            drawForbiddenMatrix(visual, this.forbiddenMatrix!);
            drawPathMatrix(visual, this.pathMatrix!);
            fillCoords(visual, checkedCoords);
            visual.connectRoads();
        }

        return true;
    }

    private placeExtensionsPods() {
        if (!this.storagePos) return this.fail("Cannot place extension pods without a storage position");
        if (!this.storageGradient) return this.fail("Unable to plan without a storage gradient");

        drawPathMatrix(new RoomVisual(this.roomName), this.pathMatrix!);

        let toPlace: BuildableStructureConstant[][][] = clone2DArray(EXTENSION_GROUP[8].buildings);
        let placedPos: Coord[] = [];
        //60 E + 6 towers
        //16 fast filler
        //Need to place 50 Es. That makes 10 pods
        let targetPlaced = 10;

        let checkedTo = 0;
        for (let i = 0; i < this.storageGradient.length && placedPos.length < targetPlaced; i++) {
            //Dont bother with rotations here
            let offSet = this.placeCentered(this.storageGradient[i], toPlace);
            if (offSet !== false) {
                placedPos.push({
                    x: this.storageGradient[i].x - offSet,
                    y: this.storageGradient[i].y - offSet
                });
            }
            checkedTo = i;
        }

        this.placedExtensionPods = placedPos.map(p => {
            return {
                dx: p.x,
                dy: p.y,
                group: deepCopyGroups(EXTENSION_GROUP)
            };
        });

        if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
            let visual = new RoomVisual(this.roomName);
            fillCoords(visual, this.storageGradient.slice(0, checkedTo + 1));
            this.placedExtensionPods.forEach(p => drawPlacedStructureGroup(visual, p));
            drawPlacedStructureGroup(visual, this.placedStorageCore);
            drawPlacedStructureGroup(visual, this.placedFastFiller);
            drawPathMatrix(visual, this.pathMatrix!);
            visual.connectRoads();
        }

        return true;
    }

    private placeRoadPaths(): boolean {
        if (!this.storagePos) return this.fail("Cannot load mining paths without a storage position");
        if (!this.placedExtensionPods) return this.fail("Cannot load mining paths placed extension pods");
        if (!this.placedFastFiller) return this.fail("Cannot load mining paths placed fast filler pods");
        if (!this.roomData.miningInfo || !this.roomData.pathingInfo)
            return this.fail("Cannot load mining paths without a storage position");
        if (!this.placedUpgradeContainer) return this.fail("Cannot place roads without an upgrader position");

        let pathingTargets: RoomPosition[] = [];
        //Add the fast filler station
        let fillerOffset = Math.floor(this.placedFastFiller.group[8].buildings.length / 2);
        pathingTargets.push(
            new RoomPosition(
                this.placedFastFiller.dx + fillerOffset,
                this.placedFastFiller.dy + fillerOffset,
                this.roomName
            )
        );
        //Add the sources in the room
        this.roomData.miningInfo!.sources.forEach(s => pathingTargets.push(unpackPos(s.packedPosition)));
        //Add a path to the mineral
        pathingTargets.push(unpackPos(this.roomData.miningInfo.mineral.packedPosition));
        //Add a path to the controller
        pathingTargets.push(roomPos(this.placedUpgradeContainer, this.roomName));
        //Add paths to each of the extension pods. We are pathing at range 1, so path to the middle of the pod
        for (let pod of this.placedExtensionPods) {
            let offset = Math.floor(pod.group[8].buildings.length / 2);
            pathingTargets.push(new RoomPosition(pod.dx + offset, pod.dy + offset, this.roomName));
        }

        let done = true;
        if (!this.placedRoads) this.placedRoads = [];
        let callback = (roomName: string) => (this.roomName === roomName ? this.pathMatrix! : false);

        for (let target of pathingTargets) {
            let path = PathFinder.search(this.storagePos!, {
                pos: target,
                range: 1
            }, {roomCallback: callback});
            for (let pos of path.path) {
                if (this.pathMatrix?.get(pos.x, pos.y) !== 1) {
                    this.pathMatrix?.set(pos.x, pos.y, 1);
                    this.placedRoads.push(pos);
                    done = false;
                    break;
                }
            }
        }

        if (done) {
            //We placed roads ontop of our upgrade container.
            this.upgraderPositions = this.upgraderPositions!.filter(p => this.pathMatrix?.get(p.x, p.y) !== 1);
        }

        if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
            let visual = new RoomVisual(this.roomName);
            this.placedExtensionPods!.forEach(p => drawPlacedStructureGroup(visual, p));
            drawPlacedStructureGroup(visual, this.placedStorageCore);
            drawPlacedStructureGroup(visual, this.placedFastFiller);
            for (let roadPos of this.placedRoads) visual.structure(roadPos.x, roadPos.y, STRUCTURE_ROAD, {});
            visual.structure(this.placedUpgradeContainer!.x, this.placedUpgradeContainer!.y, STRUCTURE_CONTAINER, {});
            for (let upgradePos of this.upgraderPositions!)
                visual.circle(upgradePos.x, upgradePos.y, {radius: 0.5, fill: "blue"});
            visual.connectRoads();
        }

        return done;
    }

    private placeWalls(): boolean {
        if (!this.placedExtensionPods) return this.fail("Cannot place walls without extension pods");
        if (!this.placedFastFiller) return this.fail("Cannot place walls without fast filler");
        if (!this.placedStorageCore) return this.fail("Cannot place walls without storage core");

        const rectArray = [];

        rectArray.push(this.rectAround(this.placedFastFiller));
        rectArray.push(this.rectAround(this.placedStorageCore));
        this.placedExtensionPods.forEach(pod => rectArray.push(this.rectAround(pod)));

        this.placedWalls = getCutTiles(this.roomName, rectArray, true, Infinity, true);

        return true;
    }

    private placeTowers(): boolean {
        if (!this.placedWalls) return this.fail("Cannot place towers without walls");
        if (!this.placedExtensionPods) return this.fail("Cannot place towers without extension pods to replace");

        let avgX = _.sum(this.placedWalls, t => t.x) / this.placedWalls.length;
        let avgY = _.sum(this.placedWalls, t => t.y) / this.placedWalls.length;

        //Find the positions of all of the extensions in pods
        let ePodPositions: Coord[] = [];
        this.placedExtensionPods.forEach(pod => {
            let buildings = pod.group[8].buildings;
            for (let y = 0; y < buildings.length; y++) {
                for (let x = 0; x < buildings[y].length; x++) {
                    if (buildings[y][x].includes(STRUCTURE_EXTENSION)) {
                        ePodPositions.push({x: x + pod.dx, y: y + pod.dy});
                    }
                }
            }
        });

        //Find the 6 extensions that are closest to the central ramp pos and put the towers there
        this.placedTowers = [];
        for (let i = 0; i < 6; i++) {
            let clostestIndex = 0;
            let minDistance = 300;
            for (let towerIndex = 0; towerIndex < ePodPositions.length; towerIndex++) {
                let distance = euclidianDistance(avgX, avgY, ePodPositions[towerIndex].x, ePodPositions[towerIndex].y);
                if (distance < minDistance) {
                    minDistance = distance;
                    clostestIndex = towerIndex;
                }
            }

            this.placedTowers.push(ePodPositions[clostestIndex]);
            ePodPositions.splice(clostestIndex, 1);
        }

        //Replace the extensions with towers
        this.placedExtensionPods?.forEach(pod => {
            for (let rcl = 1; rcl <= 8; rcl++) {
                let buildings = pod.group[rcl].buildings;
                for (let y = 0; y < buildings.length; y++) {
                    for (let x = 0; x < buildings[y].length; x++) {
                        for (let towerPos of this.placedTowers!) {
                            let buildingX = x + pod.dx;
                            let buildingY = y + pod.dy;

                            if (
                                towerPos.x === buildingX &&
                                towerPos.y === buildingY &&
                                buildings[y][x].includes(STRUCTURE_EXTENSION)
                            ) {
                                buildings[y][x] = [];
                                buildings[y][x].push(STRUCTURE_TOWER);
                            }
                        }
                    }
                }
            }
        });

        if (shouldVisualize(FEATURE_VISUALIZE_PLANNING)) {
            let visual = new RoomVisual(this.roomName);
            visual.circle(avgX, avgY, {radius: 1, fill: "red"});

            this.placedWalls!.forEach(pos => visual.structure(pos.x, pos.y, STRUCTURE_RAMPART, {}));
            this.placedExtensionPods!.forEach(p => drawPlacedStructureGroup(visual, p));
            drawPlacedStructureGroup(visual, this.placedStorageCore);
            drawPlacedStructureGroup(visual, this.placedFastFiller);
            for (let roadPos of this.placedRoads!) visual.structure(roadPos.x, roadPos.y, STRUCTURE_ROAD, {});

            fillCoords(visual, ePodPositions);
            this.placedTowers.forEach(p => visual.circle(p.x, p.y, {radius: 0.5, fill: "green"}));

            visual.connectRoads();
        }

        return true;
    }

    private rectAround(group: PlacedStructureGroup): Rectangle {
        const width = group.group[8].buildings.length;
        const padding = 2; //All our buildings are surrounded with roads. Only pad with 2 instead of 3
        return {
            x1: Math.max(group.dx - padding, 0),
            y1: Math.max(group.dy - padding, 0),
            x2: Math.min(group.dx + width + padding, 49),
            y2: Math.min(group.dy + width + padding, 49)
        };
    }

    //Will attempt to center the structure around the given point. On success returns the offset value
    // that can be subtracted from the center coord to result in the stamp being centered
    private placeCentered(center: Coord, group: BuildableStructureConstant[][][]): number | false {
        let offset = Math.floor(group.length / 2); //square matrix remember?
        let upperLeft: Coord = {x: center.x - offset, y: center.y - offset};
        if (this.place(upperLeft, group)) return offset;
        return false;
    }

    //Places the structure at the given coord.
    private place(upperLeft: Coord, group: BuildableStructureConstant[][][]): boolean {
        group = clone2DArray(group);
        //We check the middle square, not the upper left one
        // upperLeft = { x: upperLeft.x - Math.floor(size / 2), y: upperLeft.y - Math.floor(size / 2) };
        let dx = upperLeft.x;
        let dy = upperLeft.y;

        for (let y = 0; y < group.length; y++) {
            if (y + dy < 0 || y + dy >= 50) return false;
            for (let x = 0; x < group[y].length; x++) {
                if (!group[y][x].length) continue; //If we don't have anything to place, then we are good

                if (x + dx < 0 || x + dx >= 50) return false;
                let blocking = _.any(group[y][x], b => !isWalkableOwnedRoom(b));
                //Don't place blocking sturctures ontop of forbidden spaces
                if (blocking && this.forbiddenMatrix?.get(x + dx, y + dy) === 255) return false;
                //Don't place blocking sturctures on roads
                if (blocking && this.pathMatrix?.get(x, y) === 1) return false;
                //Also don't place anything on walls obviously
                if (this.pathMatrix?.get(x + dx, y + dy) === 255) return false;
            }
        }

        //If we got this far, we are safe to place it down
        for (let y = 0; y < group.length; y++) {
            for (let x = 0; x < group[y].length; x++) {
                let blocking = _.any(group[y][x], b => !isWalkableOwnedRoom(b));
                if (blocking) this.pathMatrix?.set(x + dx, y + dy, 255);
                let hasRoad = _.any(group[y][x], b => b === STRUCTURE_ROAD);
                if (hasRoad) this.pathMatrix?.set(x + dx, y + dy, 1);
            }
        }

        return true;
    }

    private fail(reason: string): boolean {
        this.failReason = reason;
        this.planningState = "Failed";
        return false;
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

function drawPathMatrix(visual: RoomVisual, matrix: CostMatrix) {
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
        if (!coords[i]) continue;
        let x = coords[i].x;
        let y = coords[i].y;
        visual.rect(x - 0.5, y - 0.5, 1, 1, {
            fill: "hsl(" + (i / coords.length) * 320 + ", 100%, 60%)",
            opacity: 0.4
        });
    }
}
