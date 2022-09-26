import { getRoomData } from "system/scouting/ScoutInterface";
import { LagoonDetector } from "utils/algorithms/LagoonFlow";
import { FEATURE_VISUALIZE_PLANNING } from "utils/featureToggles/FeatureToggleConstants";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { Log } from "utils/logger/Logger";
import { PriorityQueue, PriorityQueueItem } from "utils/PriorityQueue";
import { drawPlacedStructureGroup, planStructures } from "./PlannerLogic";

const LAGOON_FLOW_ITERATIONS = 100;

class RoomPlannerJob implements PriorityQueueItem {
    private controllerPos: RoomPosition;
    private exitCoords: Coord[];
    private lagoonDetector: LagoonDetector;

    roomName: string;
    minRoomDepth: number;
    queueIndex: number = 0; //Will get overwritten

    constructor(room: Room, depth: number) {
        Log.i(`Queued room planning job in ${room.name}`);
        this.roomName = room.name;
        this.minRoomDepth = depth;
        this.controllerPos = room.controller!.pos;
        this.exitCoords = room.find(FIND_EXIT).map(e => e.localCoords);
        this.lagoonDetector = new LagoonDetector(room, LAGOON_FLOW_ITERATIONS);
    }

    public run() {
        let matrix: CostMatrix | undefined;
        for (let i = 0; i < 5 && !matrix; i++) {
            matrix = this.lagoonDetector.advanceFlow();
        }

        if (getFeature(FEATURE_VISUALIZE_PLANNING)) {
            this.lagoonDetector.visualize();
        }

        if (matrix) {
            return planStructures(this.roomName, matrix, this.controllerPos, this.exitCoords);
        }
        return undefined;
    }
}

export var _queuedJobs: PriorityQueue<RoomPlannerJob> = new PriorityQueue(5, (a, b) => a.minRoomDepth - b.minRoomDepth);

export function planRoom(room: Room, roomDepth: number = 99): void {
    if (
        !_.any(
            _queuedJobs.items.filter(i => i),
            j => j.roomName === room.name
        )
    ) {
        //Try to prioritize planning rooms that are closer to home
        _queuedJobs.enqueue(new RoomPlannerJob(room, roomDepth));
    }
}
