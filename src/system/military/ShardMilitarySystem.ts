//Will keep track of room-level military systems
//Will distribute military operations among room level systems

import {profile} from "../../utils/profiler/Profiler";
import {RoomMilitarySystem} from "./RoomMilitarySystem";
import {Log} from "../../utils/logger/Logger";
import {registerResetFunction} from "../../utils/SystemResetter";

@profile
export class ShardMilitarySystem {
    private militarySystems: RoomMilitarySystem[] = []

    //Loop through the spawns, get unique rooms with active spawns, and make sure we have a room military system for each
    //Remove military systems we don't have room visibility or spawns in
    public _rescanRooms() {
        this.militarySystems.forEach(system => {
            let roomName = system.roomName;
            if (!Game.rooms[roomName] || Game.rooms[roomName].find(FIND_MY_SPAWNS).length === 0) {
                Log.w(`No spawns detected in ${roomName}, unregistering as a military power`);
            }
        });

        //Make sure we have a room miner system per spawn room
        let ownedRooms = _.unique(
            Object.values(Game.spawns)
                .filter(spawn => spawn.isActive() && Game.rooms[spawn.pos.roomName])
                .map(spawn => spawn.pos.roomName)
        );
        ownedRooms.forEach(roomName => {
            let associatedSystem = this.militarySystems.find(s => s.roomName === roomName)
            if (!associatedSystem) {
                Log.i(`Detected military power in ${roomName}, starting responding to operations`);
                this.militarySystems.push(new RoomMilitarySystem(roomName));
            }
        });
    }
}

export let _shardMilitarySystem: ShardMilitarySystem = new ShardMilitarySystem();
registerResetFunction(() => (_shardMilitarySystem = new ShardMilitarySystem()));
