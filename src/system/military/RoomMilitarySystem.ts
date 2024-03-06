import {profile} from "../../utils/profiler/Profiler";

//This class looks at registered military operations

@profile
export class RoomMilitarySystem {
    public roomName: string

    constructor(roomName: string) {
        this.roomName = roomName;
    }
}