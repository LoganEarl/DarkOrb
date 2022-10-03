import { getRoomData, saveMapData } from "system/scouting/ScoutInterface";
import { Log } from "utils/logger/Logger";
import { registerResetFunction } from "utils/SystemResetter";
import { _queuedJobs } from "./PlannerInterface";

class ShardPlannerSystem {
    public _continuePlanning(): void {
        let job = _queuedJobs.peek();
        if (job) {
            let result = job.continuePlanning();
            if (result) {
                if (!job.failReason) {
                    Log.i(`Successfully planned room ${job.roomName}`);
                } else {
                    Log.i(`Failed to plan room ${job.roomName} with status: ${job.failReason}`);
                }

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
