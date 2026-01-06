import {Log} from "utils/logger/Logger";
import {insertSorted} from "utils/UtilityFunctions";
import {RoomPlanner} from "./PlannerLogic";

export var _queuedJobs: RoomPlanner[] = [];

export function planRoom(room: Room, roomData: RoomScoutingInfo): void {
    if (!_queuedJobs.find(p => p.roomName === room.name)) {
        //Try to prioritize planning rooms that are closer to home
        _queuedJobs = insertSorted(new RoomPlanner(room, roomData), _queuedJobs, (a, b) => a.roomDepth - b.roomDepth);
        Log.i(`Queued up room planning job in ${room.name}. Queue:${JSON.stringify(_queuedJobs.map(j => j.roomName))}`);
    }
}
