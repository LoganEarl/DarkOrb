import { Process } from "core/Process";
import { getRoomData, getShardData } from "system/scouting/ScoutInterface";
import { FEATURE_VISUALIZE_PLANNING } from "utils/featureToggles/FeatureToggleConstants";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { _shardPlannerSystem } from "./ShardPlannerSystem";

export class PlannerPRocess extends Process {
    processType = "PlannerProcess";

    constructor() {
        super("PlannerProcess", 3);
    }

    run(): void {
        _shardPlannerSystem._continuePlanning();

        // if (getFeature(FEATURE_VISUALIZE_PLANNING)) {
        //     let plannedRooms = Object.values(getShardData())
        //         .filter(d => d.roomPlan)
        //         .map(p => p.roomName);
        //     for (let roomName of plannedRooms) {
        //         let visual = new RoomVisual(roomName);
        //         let plan = getRoomData(roomName)!.roomPlan!;
        //         drawPlacedStructureGroup(visual, plan.storageCore);
        //         drawPlacedStructureGroup(visual, plan.fastFiller);
        //         drawPlacedStructureGroup(visual, plan.extensions);
        //         if (plan.extensionPods?.length) {
        //             for (let pod of plan.extensionPods) {
        //                 drawPlacedStructureGroup(visual, pod);
        //             }
        //         }
        //         visual.connectRoads();
        //     }
        // }
    }
}
