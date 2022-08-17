//Has room spawn systems by room name

import { Log } from "utils/logger/Logger";
import { RoomSpawnSystem } from "./RoomSpawnSystem";

class ShardSpawnSystem {
    public roomSpawnSystems: { [roomName: string]: RoomSpawnSystem } = {};

    //Initialize the spawning systems
    public scanSpawnSystems() {
        //Check for registered rooms that are dead
        for (let system of Object.values(this.roomSpawnSystems)) {
            if (!Game.rooms[system.roomName] || !Game.rooms[system.roomName].controller?.my) {
                Log.w(
                    `Unregistering spawn system in room:${system.roomName} as the controller is no longer under our control`
                );
            }
        }

        //Check for new or unregistered rooms
        for (let room of Object.values(Game.rooms)) {
            if (room.controller?.my && !this.roomSpawnSystems[room.name]) {
                Log.i("Creating spawn manager for room: " + room.name)
                this.roomSpawnSystems[room.name] = new RoomSpawnSystem(room);
            }
        }
    }

    public spawnCreeps() {
        Object.values(this.roomSpawnSystems).forEach(s => s.spawnCreeps())
    }
}

export const shardSpawnSystem: ShardSpawnSystem = new ShardSpawnSystem();




