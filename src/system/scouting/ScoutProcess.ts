import { Process } from "core/Process";
import { Log } from "utils/logger/Logger";
import { ScheduledJob } from "utils/ScheduledJob";
import { shardScoutSystem } from "./ShardScoutSystem";

//Responsible for triggering spawning code. Single process for the whole empire
export class ScoutProcess extends Process {
    processType = "ScoutProcess";

    clusterRecreator: ScheduledJob = new ScheduledJob(
        () => {
            shardScoutSystem.createSuperclusters();
            shardScoutSystem.subdivideSupercluster();
            shardScoutSystem.registerCreepConfigs();
        },
        this,
        500
    );
    clusterSubdivider: ScheduledJob = new ScheduledJob(shardScoutSystem.subdivideSupercluster, shardScoutSystem, 100);
    creepConfigUpdater: ScheduledJob = new ScheduledJob(shardScoutSystem.registerCreepConfigs, shardScoutSystem, 100);
    jobChecker: ScheduledJob = new ScheduledJob(shardScoutSystem.clearDeadCreepAssignments, shardScoutSystem, 10);

    constructor() {
        super("ScoutProcess", 1);
        shardScoutSystem.createSuperclusters();
        shardScoutSystem.subdivideSupercluster();
        shardScoutSystem.registerCreepConfigs();
    }

    run(): void {
        this.jobChecker.run();
        this.clusterRecreator.run();
        this.clusterSubdivider.run();
        this.creepConfigUpdater.run();
        shardScoutSystem.runCreeps();
    }
}
