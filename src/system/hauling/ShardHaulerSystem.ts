import { Log } from "utils/logger/Logger";
import { profile } from "utils/profiler/Profiler";
import { registerResetFunction } from "utils/SystemResetter";
import { RoomHaulerSystem } from "./RoomHaulerSystem";

@profile
class ShardHaulerSystem {
    private roomHaulerSystems: { [roomName: string]: RoomHaulerSystem } = {};

    public _rescanRooms() {
        // Log.d("Rescanning hauling rooms");
        let minerRooms = Object.keys(this.roomHaulerSystems);
        minerRooms.forEach(roomName => {
            if (!Game.rooms[roomName] || Game.rooms[roomName].find(FIND_MY_SPAWNS).length === 0) {
                Log.w(`No spawns detected in ${roomName}, unregistering as a mining source`);
            }
        });

        //Make sure we have a room hauler system per spawn room
        let ownedRooms = _.unique(
            Object.values(Game.spawns)
                .filter(spawn => spawn.isActive() && Game.rooms[spawn.pos.roomName])
                .map(spawn => spawn.pos.roomName)
        );
        ownedRooms.forEach(roomName => {
            if (!this.roomHaulerSystems[roomName]) {
                Log.i(`Detected miner system in ${roomName}, starting mining`);
                this.roomHaulerSystems[roomName] = new RoomHaulerSystem(roomName);
            }
        });
    }

    public _runCreeps() {
        Object.values(this.roomHaulerSystems).forEach(s => s._runCreeps());
    }

    public _reloadAllConfigs() {
        Object.values(this.roomHaulerSystems).forEach(s => s._reloadConfigs());
    }

    public _visualize() {
        Object.values(this.roomHaulerSystems).forEach(s => s._visualize());
    }
}

export let _shardHaulerSystem = new ShardHaulerSystem();
registerResetFunction(() => (_shardHaulerSystem = new ShardHaulerSystem()));
