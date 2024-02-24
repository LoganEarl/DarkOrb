import {Process} from "core/Process";
import {FEATURE_VISUALIZE_STORAGE} from "utils/featureToggles/FeatureToggleConstants";
import {shouldVisualize} from "utils/featureToggles/FeatureToggles";
import {profile} from "utils/profiler/Profiler";
import {ScheduledJob} from "utils/ScheduledJob";
import {_shardStorageSystem} from "./ShardStorageSystem";

@profile
export class StorageProcess extends Process {
    processType = "StorageProcess";
    //Check for new spawning rooms and trim the old ones once every 10 ticks or so
    periodicRoomScanner: ScheduledJob = new ScheduledJob(
        _shardStorageSystem._scanStorageSystems,
        _shardStorageSystem,
        10
    );

    constructor() {
        super("StorageProcess", 10);
        _shardStorageSystem._scanStorageSystems();
    }

    run(): void {
        this.periodicRoomScanner.run();
    }

    postRun(): void {
        _shardStorageSystem._totalAnalytics();

        if (shouldVisualize(FEATURE_VISUALIZE_STORAGE)) {
            _shardStorageSystem._visualize();
        }
    }
}
