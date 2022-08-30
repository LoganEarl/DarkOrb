import { Process } from "core/Process";
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
        super("StorageProcess", 1);
        _shardStorageSystem._scanStorageSystems();
    }

    run(): void {
        this.periodicRoomScanner.run();
    }
}
