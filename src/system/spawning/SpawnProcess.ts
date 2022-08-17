import { Process } from "core/Process";
import { ScheduledJob } from "utils/ScheduledJob";
import { shardSpawnSystem } from "./ShardSpawnSystem";

//Responsible for triggering spawning code. Single process for the whole empire
export class SpawnProcess extends Process {
    processType = "SpawnProcess";
    //Check for new spawning rooms and trim the old ones once every 10 ticks or so
    periodicRoomScanner: ScheduledJob = new ScheduledJob(shardSpawnSystem.scanSpawnSystems, shardSpawnSystem, 10);

    constructor() {
        super("SpawnProcess", 1);
    }

    run(): void {
        this.periodicRoomScanner.run();
        shardSpawnSystem.spawnCreeps();
    }
}
