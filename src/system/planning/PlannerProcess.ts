import { Process } from "core/Process";
import { getRoomData, getShardData } from "system/scouting/ScoutInterface";
import { FEATURE_VISUALIZE_PLANNING } from "utils/featureToggles/FeatureToggleConstants";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { drawPlacedStructureGroup } from "./PlannerLogic";
import { _shardPlannerSystem } from "./ShardPlannerSystem";

export class PlannerProcess extends Process {
    processType = "PlannerProcess";

    constructor() {
        super("PlannerProcess", 3);
    }

    run(): void {
        _shardPlannerSystem._continuePlanning();

        if (getFeature(FEATURE_VISUALIZE_PLANNING)) {
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
