import { Process } from "core/Process";
import { profile } from "utils/profiler/Profiler";
import { ScheduledJob } from "utils/ScheduledJob";
import { _shardSpawnSystem } from "./ShardSpawnSystem";

//Responsible for triggering spawning code. Single process for the whole empire
@profile
export class SpawnProcess extends Process {
    processType = "SpawnProcess";
    //Check for new spawning rooms and trim the old ones once every 10 ticks or so
    periodicRoomScanner: ScheduledJob = new ScheduledJob(_shardSpawnSystem._scanSpawnSystems, _shardSpawnSystem, 10);

    constructor() {
        super("SpawnProcess", 0);
        _shardSpawnSystem._scanSpawnSystems();
    }

    run(): void {
        this.periodicRoomScanner.run();
        _shardSpawnSystem._updateLogisticsNodes();
        _shardSpawnSystem._spawnCreeps();
    }
}
