import { Process } from "core/Process";
import { FEATURE_VISUALIZE_WORK } from "utils/featureToggles/FeatureToggleConstants";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { profile } from "utils/profiler/Profiler";
import { ScheduledJob } from "utils/ScheduledJob";
import { _shardWorkerSystem } from "./ShardWorkerSystem";

@profile
export class WorkerProcess extends Process {
    processType = "WorkProcess";
    //Check for new rooms and trim the old ones once every 10 ticks or so
    periodicRoomScanner: ScheduledJob = new ScheduledJob(_shardWorkerSystem._scanWorkSystems, _shardWorkerSystem, 10);
    configReloader: ScheduledJob = new ScheduledJob(_shardWorkerSystem._reloadConfigs, _shardWorkerSystem, 10);
    focusReloader: ScheduledJob = new ScheduledJob(_shardWorkerSystem._reloadFocus, _shardWorkerSystem, 20);

    constructor() {
        super("WorkProcess", 10);
        _shardWorkerSystem._scanWorkSystems();
    }

    private first = true;
    run(): void {
        if (this.first) {
            this.first = false;
            _shardWorkerSystem._reloadConfigs();
        } else {
            this.configReloader.run();
        }

        this.periodicRoomScanner.run();
        this.focusReloader.run();
        _shardWorkerSystem._runCreeps();
        _shardWorkerSystem._scanForWork();

        if (getFeature(FEATURE_VISUALIZE_WORK)) {
            _shardWorkerSystem._visualize();
        }
    }
}
