import { Process } from "core/Process";
import { FEATURE_VISUALIZE_SCOUTING } from "utils/featureToggles/FeatureToggleRegistry";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { ScheduledJob } from "utils/ScheduledJob";
import { _shardScoutSystem } from "./ShardScoutSystem";

//Responsible for triggering spawning code. Single process for the whole empire
export class ScoutProcess extends Process {
    processType = "ScoutProcess";

    clusterRecreator: ScheduledJob = new ScheduledJob(
        () => {
            _shardScoutSystem._createSuperclusters();
            _shardScoutSystem._subdivideSupercluster();
            _shardScoutSystem._registerCreepConfigs();
        },
        this,
        500
    );
    clusterSubdivider: ScheduledJob = new ScheduledJob(
        _shardScoutSystem._subdivideSupercluster,
        _shardScoutSystem,
        100
    );
    creepConfigUpdater: ScheduledJob = new ScheduledJob(_shardScoutSystem._registerCreepConfigs, _shardScoutSystem, 50);
    jobChecker: ScheduledJob = new ScheduledJob(_shardScoutSystem._clearDeadCreepAssignments, _shardScoutSystem, 10);

    constructor() {
        super("ScoutProcess", 1);
        _shardScoutSystem._createSuperclusters();
        _shardScoutSystem._subdivideSupercluster();
        _shardScoutSystem._registerCreepConfigs();
    }

    run(): void {
        this.jobChecker.run();
        this.clusterRecreator.run();
        this.clusterSubdivider.run();
        this.creepConfigUpdater.run();
        _shardScoutSystem._runCreeps();

        if (getFeature(FEATURE_VISUALIZE_SCOUTING)) {
            _shardScoutSystem._visualize();
        }
    }
}
