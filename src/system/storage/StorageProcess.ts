import { Process } from "core/Process";
import { FEATURE_VISUALIZE_STORAGE } from "utils/featureToggles/FeatureToggleRegistry";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { ScheduledJob } from "utils/ScheduledJob";
import { _shardStorageSystem } from "./ShardStorageSystem";

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

        if (getFeature(FEATURE_VISUALIZE_STORAGE)) {
            _shardStorageSystem._visualize();
        }
    }
}
