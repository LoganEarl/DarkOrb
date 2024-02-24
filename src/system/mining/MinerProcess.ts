import {Process} from "core/Process";
import {FEATURE_VISUALIZE_MINING} from "utils/featureToggles/FeatureToggleConstants";
import {shouldVisualize} from "utils/featureToggles/FeatureToggles";
import {profile} from "utils/profiler/Profiler";
import {ScheduledJob} from "utils/ScheduledJob";
import {_shardMinerSystem} from "./ShardMinerSystem";

@profile
export class MinerProcess extends Process {
    processType = "MinerProcess";

    private first = true;

    roomScanner: ScheduledJob = new ScheduledJob(_shardMinerSystem._rescanRooms, _shardMinerSystem, 10);
    minePartitioner: ScheduledJob = new ScheduledJob(_shardMinerSystem._repartitionMiningRooms, _shardMinerSystem, 100);
    configReloader: ScheduledJob = new ScheduledJob(_shardMinerSystem._reloadAllConfigs, _shardMinerSystem, 50);
    pathReloader: ScheduledJob = new ScheduledJob(_shardMinerSystem._reloadAllPaths, _shardMinerSystem, 50);
    jobReloader: ScheduledJob = new ScheduledJob(_shardMinerSystem._reloadActiveMiningJobs, _shardMinerSystem, 50);

    constructor() {
        super("MinerProcess", 1);
    }

    run(): void {
        if (this.first) {
            this.first = false;
            _shardMinerSystem._rescanRooms();
            _shardMinerSystem._repartitionMiningRooms();
            _shardMinerSystem._reloadAllPaths();
            _shardMinerSystem._reloadActiveMiningJobs();
            _shardMinerSystem._reloadAllConfigs();
        } else {
            this.roomScanner.run();
            this.minePartitioner.run();
            this.configReloader.run();
            this.pathReloader.run();
            this.jobReloader.run();
        }
        _shardMinerSystem._runCreeps();

        if (shouldVisualize(FEATURE_VISUALIZE_MINING)) {
            _shardMinerSystem._visualize();
        }
    }
}
