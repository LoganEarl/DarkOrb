import {profile} from "../../utils/profiler/Profiler";
import {Process} from "../../core/Process";
import {ScheduledJob} from "../../utils/ScheduledJob";
import {_shardMilitarySystem} from "./ShardMilitarySystem";

@profile
export class MilitaryProcess extends Process {
    processType = "MilitaryProcess";
    private first = true;


    roomScanner: ScheduledJob = new ScheduledJob(_shardMilitarySystem._rescanRooms, _shardMilitarySystem, 50)

    constructor() {
        super("MilitaryProcess", 0);
    }

    run() {
        if (this.first) {
            this.first = false;
            _shardMilitarySystem._rescanRooms();
        } else {
            this.roomScanner.run();
        }
    }
}