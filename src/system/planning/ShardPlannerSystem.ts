import { getRoomData, saveMapData } from "system/scouting/ScoutInterface";
import { Log } from "utils/logger/Logger";
import { registerResetFunction } from "utils/SystemResetter";
import { _queuedJobs } from "./PlannerInterface";

class ShardPlannerSystem {
    //IF the controller is claimed, figure out the RCL and compare it to the plan.
    //Look at the structures. We need to look for ones that are under the build limit AND are not placed AND don't already have a csite
    //We also need a way of managing the number of construction sites available. Lets keep things simple and just allocate 100/rooms csites to the current room
    //We place cstites up to that limit

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
