//Has room spawn systems by room name

import { Log } from "utils/logger/Logger";
import { registerResetFunction } from "utils/SystemResetter";
import { RoomSpawnSystem } from "./RoomSpawnSystem";

class ShardSpawnSystem {
    private roomSpawnSystems: { [roomName: string]: RoomSpawnSystem } = {};

    //Initialize the spawning systems
    _scanSpawnSystems() {
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
                Log.i("Creating spawn manager for room: " + room.name);
                this.roomSpawnSystems[room.name] = new RoomSpawnSystem(room);
            }
        }
    }

    _spawnCreeps() {
        Object.values(this.roomSpawnSystems).forEach(s => s._spawnCreeps());
    }

    _registerCreepConfig(handle: string, config: CreepConfig[], roomName?: string) {
        //TODO we need a way of doing this properly. Maybe a queue system where we add additional creeps to rooms?
        Object.values(this.roomSpawnSystems)[0]._registerCreepConfig(handle, config);
    }

    _unregisterHandle(handle: string, roomName?: string) {
        //TODO we need a way of doing this properly
        Object.values(this.roomSpawnSystems)[0]._unregisterHandle(handle);
    }
}

export let _shardSpawnSystem: ShardSpawnSystem = new ShardSpawnSystem();
registerResetFunction(() => (_shardSpawnSystem = new ShardSpawnSystem()));
