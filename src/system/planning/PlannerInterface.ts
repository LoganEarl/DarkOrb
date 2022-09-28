import { PriorityQueue, PriorityQueueItem } from "utils/PriorityQueue";
import { RoomPlanner } from "./BetterPlanner";

export var _queuedJobs: PriorityQueue<RoomPlanner> = new PriorityQueue(5, (a, b) => a.roomDepth - b.roomDepth);

export function planRoom(room: Room, roomData: RoomScoutingInfo): void {
    if (
        !_.any(
            _queuedJobs.items.filter(i => i),
            j => j.roomName === room.name
        )
    ) {
        //Try to prioritize planning rooms that are closer to home
        _queuedJobs.enqueue(new RoomPlanner(room, roomData));
    }
}
