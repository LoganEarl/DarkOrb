import { getRoomData, saveMapData } from "system/scouting/ScoutInterface";
import { LagoonDetector } from "utils/algorithms/LagoonFlow";
import { Log } from "utils/logger/Logger";
import { MemoryComponent } from "utils/MemoryWriter";
import { PriorityQueue, PriorityQueueItem } from "utils/PriorityQueue";
import { registerResetFunction } from "utils/SystemResetter";
import { _queuedJobs } from "./PlannerInterface";

class ShardPlannerSystem {
    public _continuePlanning(): void {
        let job = _queuedJobs.peek();
        if (job) {
            let result = job.continuePlanning();
            if (result) {
                let mapData = getRoomData(job.roomName);
                if (mapData) {
                    mapData.roomPlan = result;
                    saveMapData(mapData);
                }
                _queuedJobs.dequeue();
            }
        }
    }
}

export let _shardPlannerSystem: ShardPlannerSystem = new ShardPlannerSystem();
registerResetFunction(() => (_shardPlannerSystem = new ShardPlannerSystem()));
