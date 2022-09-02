import { Process } from "core/Process";
import { FEATURE_VISUALIZE_MINING } from "utils/featureToggles/FeatureToggleRegistry";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { ScheduledJob } from "utils/ScheduledJob";
import { _shardMinerSystem } from "./ShardMinerSystem";

export class MinerProcess extends Process {
    processType = "MinerProcess";

    roomScanner: ScheduledJob = new ScheduledJob(_shardMinerSystem._rescanRooms, _shardMinerSystem, 10);
    minePartitioner: ScheduledJob = new ScheduledJob(_shardMinerSystem._repartitionMiningRooms, _shardMinerSystem, 100);
    configReloader: ScheduledJob = new ScheduledJob(_shardMinerSystem._reloadAllConfigs, _shardMinerSystem, 50);
    pathReloader: ScheduledJob = new ScheduledJob(_shardMinerSystem._reloadAllPaths, _shardMinerSystem, 50);
    jobReloader: ScheduledJob = new ScheduledJob(_shardMinerSystem._reloadActiveMiningJobs, _shardMinerSystem, 50);

    constructor() {
        super("MinerProcess", 1);

        _shardMinerSystem._rescanRooms();
        _shardMinerSystem._repartitionMiningRooms();
        _shardMinerSystem._reloadAllConfigs();
        _shardMinerSystem._reloadAllPaths();
        _shardMinerSystem._reloadActiveMiningJobs();
    }

    run(): void {
        this.roomScanner.run();
        this.minePartitioner.run();
        this.configReloader.run();
        this.pathReloader.run();
        this.jobReloader.run();

        if (getFeature(FEATURE_VISUALIZE_MINING)) {
            _shardMinerSystem._visualize();
        }
    }
}
