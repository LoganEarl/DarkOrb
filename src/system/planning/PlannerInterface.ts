import { PriorityQueue } from "utils/PriorityQueue";
import { insertSorted } from "utils/UtilityFunctions";
import { RoomPlanner } from "./PlannerLogic";

export var _queuedJobs: RoomPlanner[] = [];

export function planRoom(room: Room, roomData: RoomScoutingInfo): void {
    if (
        !_.any(
            _queuedJobs.filter(i => i),
            j => j.roomName === room.name
        )
    ) {
        //Try to prioritize planning rooms that are closer to home
        insertSorted(new RoomPlanner(room, roomData), _queuedJobs, (a, b) => a.roomDepth - b.roomDepth);
    }
}
