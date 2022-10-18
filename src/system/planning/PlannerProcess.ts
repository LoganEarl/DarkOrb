import { Process } from "core/Process";
import { getRoomData, getShardData } from "system/scouting/ScoutInterface";
import { FEATURE_VISUALIZE_PLANS } from "utils/featureToggles/FeatureToggleConstants";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { profile } from "utils/profiler/Profiler";
import { ScheduledJob } from "utils/ScheduledJob";
import { drawPlacedStructureGroup } from "./PlannerLogic";
import { _shardPlannerSystem } from "./ShardPlannerSystem";

@profile
export class PlannerProcess extends Process {
    processType = "PlannerProcess";

    roomScanner: ScheduledJob = new ScheduledJob(_shardPlannerSystem._rescanRooms, _shardPlannerSystem, 30);
    buildingQueuer: ScheduledJob = new ScheduledJob(_shardPlannerSystem._queueBuildings, _shardPlannerSystem, 10);

    constructor() {
        super("PlannerProcess", 3);
    }

    run(): void {
        this.roomScanner.run();
        this.buildingQueuer.run();
        _shardPlannerSystem._continuePlanning();

        if (getFeature(FEATURE_VISUALIZE_PLANS)) {
            let plannedRooms = Object.values(getShardData())
                .filter(d => d.roomPlan)
                .map(p => p.roomName);
            for (let roomName of plannedRooms) {
                let visual = new RoomVisual(roomName);
                let plan = getRoomData(roomName)!.roomPlan!;
                drawPlacedStructureGroup(visual, plan.storageCore);
                drawPlacedStructureGroup(visual, plan.fastFiller);
                plan.roadPositions?.forEach(p => visual.structure(p.x, p.y, STRUCTURE_ROAD, {}));
                plan.wallPositions?.forEach(p => visual.structure(p.x, p.y, STRUCTURE_RAMPART, {}));
                if (plan.extensionPods?.length) {
                    for (let pod of plan.extensionPods) {
                        drawPlacedStructureGroup(visual, pod);
                    }
                }
                visual.connectRoads();
            }
        }
    }
}
