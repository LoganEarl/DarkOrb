//Has room spawn systems by room name

import {getRoomData} from "system/scouting/ScoutInterface";
import {Log} from "utils/logger/Logger";
import {registerResetFunction} from "utils/SystemResetter";
import {RoomFastFillerSystem} from "./fastFiller/RoomFastFillerSystem";
import {RoomSpawnSystem} from "./RoomSpawnSystem";
import {_setSpawnRooms} from "./SpawnInterface";
import {profile} from "../../utils/profiler/Profiler";

@profile
class ShardSpawnSystem {
    private roomSpawnSystems: { [roomName: string]: RoomSpawnSystem } = {};
    private fastFillerSystems: { [roomName: string]: RoomFastFillerSystem } = {};

    //Initialize the spawning systems
    _scanSpawnSystems() {
        //Check for registered rooms that are dead
        for (let system of Object.values(this.roomSpawnSystems)) {
            if (!Game.rooms[system.roomName] || !Game.rooms[system.roomName].controller?.my) {
                Log.w(
                    `Unregistering spawn system in room:${system.roomName} as the controller is no longer under our control`
                );
                delete this.roomSpawnSystems[system.roomName];
                delete this.fastFillerSystems[system.roomName];
            }
        }

        //Check for fast filler systems that don't have the needed structures
        for (let system of Object.values(this.fastFillerSystems)) {
            if (!system.isActive) {
                Log.w(`Unregistering fast filler in room:${system.roomName} as it has no active spawnable positions`);
                delete this.fastFillerSystems[system.roomName];
            }
        }

        //Check for new or unregistered rooms
        for (let room of Object.values(Game.rooms)) {
            if (room.controller?.my) {
                if (!this.roomSpawnSystems[room.name]) {
                    Log.i("Creating spawn manager for room: " + room.name);
                    this.roomSpawnSystems[room.name] = new RoomSpawnSystem(room);
                }

                let mapData = getRoomData(room.name);
                if (mapData?.roomPlan?.fastFiller && !this.fastFillerSystems[room.name]) {
                    let fastFiller = new RoomFastFillerSystem(room);
                    if (fastFiller.isActive) {
                        this.fastFillerSystems[fastFiller.roomName] = fastFiller;
                        Log.i(`Creating fast filler system for room:${room.name}`);
                    }
                }
            }
        }

        //Update the list of spawn rooms for use in creep config sorting
        let spawnRooms: { [roomName: string]: SpawnRoom } = {};
        Object.values(this.roomSpawnSystems)
            .map(s => Game.rooms[s.roomName])
            .forEach(
                room =>
                    (spawnRooms[room.name] = {
                        roomName: room.name,
                        tickCapacity: room.find(FIND_MY_SPAWNS).filter(s => s.isActive).length * 1500,
                        energyCapacity: room.energyCapacityAvailable
                    })
            );

        _setSpawnRooms(spawnRooms);
    }

    _spawnCreeps() {
        Object.values(this.roomSpawnSystems).forEach(s => s._spawnCreeps());
    }

    _runFillers() {
        Object.values(this.fastFillerSystems).forEach(s => s._runCreeps());
    }

    _reloadFillerConfigs() {
        Object.values(this.fastFillerSystems).forEach(s => s._reloadConfigs());
    }

    _updateLogisticsNodes() {
        Object.values(this.roomSpawnSystems).forEach(s => s._updateLogisticsNodes());
    }
}

export let _shardSpawnSystem: ShardSpawnSystem = new ShardSpawnSystem();
registerResetFunction(() => (_shardSpawnSystem = new ShardSpawnSystem()));
