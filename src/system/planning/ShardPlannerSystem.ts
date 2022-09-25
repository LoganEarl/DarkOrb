import { getMapData } from "system/scouting/ScoutInterface";
import { LagoonDetector } from "utils/algorithms/LagoonFlow";
import { Log } from "utils/logger/Logger";
import { MemoryComponent } from "utils/MemoryWriter";
import { PriorityQueue, PriorityQueueItem } from "utils/PriorityQueue";
import { registerResetFunction } from "utils/SystemResetter";
import { planRoom } from "./PlannerLogic";

const LAGOON_FLOW_ITERATIONS = 100;

class ShardPlannerSystem implements MemoryComponent {
    private memory: PlannerMemory | undefined;

    private queuedJobs: PriorityQueue<RoomPlannerJob> = new PriorityQueue(5, (a, b) => a.minRoomDepth - b.minRoomDepth);

    public _planRoom(room: Room): void {
        if (!_.any(this.queuedJobs.items, j => j.roomName === room.name)) {
            let mapData = getMapData(room.name);
            let depth = mapData?.territoryInfo[0].range;

            //Try to prioritize planning rooms that are closer to home
            this.queuedJobs.enqueue(new RoomPlannerJob(room, depth ?? 99));
        }
    }

    public _continuePlanning(): void {
        let job = this.queuedJobs.peek();
        if (job) {
            let result = job.run();
            if (result) {
            }
        }
    }

    loadMemory() {
        if (!this.memory) {
            this.memory = Memory.plannerMemory ?? {};
        }
    }

    saveMemory(): void {
        if (this.memory) {
            Memory.plannerMemory = this.memory;
        }
    }
}

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
        let matrix = this.lagoonDetector.advanceFlow();
        if (matrix) {
            return planRoom(this.roomName, matrix, this.controllerPos, this.exitCoords);
        }
        return undefined;
    }
}

export let _shardPlannerSystem: ShardPlannerSystem = new ShardPlannerSystem();
registerResetFunction(() => (_shardPlannerSystem = new ShardPlannerSystem()));
