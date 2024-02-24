import {Process} from "core/Process";
import {FEATURE_VISUALIZE_HAULING} from "utils/featureToggles/FeatureToggleConstants";
import {shouldVisualize} from "utils/featureToggles/FeatureToggles";
import {profile} from "utils/profiler/Profiler";
import {ScheduledJob} from "utils/ScheduledJob";
import {_shardHaulerSystem} from "./ShardHaulerSystem";

@profile
export class HaulerProcess extends Process {
    processType = "HaulerProcess";

    private roomScanner = new ScheduledJob(_shardHaulerSystem._rescanRooms, _shardHaulerSystem, 10);
    private configReloader = new ScheduledJob(_shardHaulerSystem._reloadAllConfigs, _shardHaulerSystem, 25);

    constructor() {
        super("HaulerProcess", 2);
    }

    private first = true;

    public run(): void {
        if (this.first) {
            _shardHaulerSystem._rescanRooms();
            _shardHaulerSystem._reloadAllConfigs();
            this.first = false;
        } else {
            this.roomScanner.run();
            this.configReloader.run();
        }

        _shardHaulerSystem._runCreeps();

        if (shouldVisualize(FEATURE_VISUALIZE_HAULING)) {
            _shardHaulerSystem._visualize();
        }
    }
}
