import { getRoomData } from "system/scouting/ScoutInterface";
import { Log } from "utils/logger/Logger";
import { unpackPos } from "utils/Packrat";
import { registerResetFunction } from "utils/SystemResetter";
import { _findAllSourcesInRange } from "./MinerLogic";
import { RoomMinerSystem } from "./RoomMinerSystem";

export class ShardMinerSystem {
    private roomMinerSystems: { [spawnRoomName: string]: RoomMinerSystem } = {};

    //Loop through the spawns, get unique rooms with active spawns, and make sure we have a room miner system for each
    //Remove miner systems we don't have room visibility or spawns in
    public _rescanRooms() {
        // Log.d("Rescanning mining rooms");
        let minerRooms = Object.keys(this.roomMinerSystems);
        minerRooms.forEach(roomName => {
            if (!Game.rooms[roomName] || Game.rooms[roomName].find(FIND_MY_SPAWNS).length === 0) {
                Log.w(`No spawns detected in ${roomName}, unregistering as a mining source`);
            }
        });

        //Make sure we have a room miner system per spawn room
        let ownedRooms = _.unique(
            Object.values(Game.spawns)
                .filter(spawn => spawn.isActive() && Game.rooms[spawn.pos.roomName])
                .map(spawn => spawn.pos.roomName)
        );
        ownedRooms.forEach(roomName => {
            if (!this.roomMinerSystems[roomName]) {
                Log.i(`Detected miner system in ${roomName}, starting mining`);
                this.roomMinerSystems[roomName] = new RoomMinerSystem(roomName);
            }
        });
    }

    //Get all sources, build up pathing info on which sources are close to which rooms. Partition the sources to the rooms
    //This is EXPENSIVE. Don't run it often...
    //TODO this can be optimized by caching distance info to avoid all the path calculation
    public _repartitionMiningRooms() {
        Log.d("Repartitioning mining rooms");
        //Get the sources in range to each spawn room
        let sourceInfosPerSpawnRoom: { [spawnRoomName: string]: SourceInfo[] } = {};
        Object.keys(this.roomMinerSystems).forEach(spawnRoom => {
            sourceInfosPerSpawnRoom[spawnRoom] = _findAllSourcesInRange(getRoomData(spawnRoom), 2, true);
        });

        //Find the optimal spawn room for each source
        let assignedSources: { [sourceId: string]: RoomMinerSystem } = {};
        let sourceRoomNames: { [sourceId: string]: string } = {};
        Object.keys(sourceInfosPerSpawnRoom).forEach(spawnRoom => {
            let sourcesToAssign: SourceInfo[] = sourceInfosPerSpawnRoom[spawnRoom];
            let roomMinerSystem: RoomMinerSystem = this.roomMinerSystems[spawnRoom];
            sourcesToAssign.forEach(source => {
                let sourceId: Id<Source> = source.id as Id<Source>;
                let sourceRoomName = unpackPos(source.packedPosition).roomName;
                sourceRoomNames[sourceId as string] = sourceRoomName;
                let existingAssignment = assignedSources[sourceId as string];

                //We already assigned it. Give it to whomever is closer
                if (existingAssignment) {
                    let mapData: RoomScoutingInfo = getRoomData(sourceRoomName)!;
                    let existingLength = existingAssignment._getLengthToSource(sourceId, mapData);
                    let testLength = roomMinerSystem._getLengthToSource(sourceId, mapData);
                    if (testLength < existingLength) {
                        assignedSources[sourceId as string] = roomMinerSystem;
                    }
                }
                //Not assigned yet. Just assign it and move on. If we get a collision we will resolve it later
                else {
                    assignedSources[sourceId as string] = roomMinerSystem;
                }
            });
        });

        //Assign the sources to their room miner system. Only has an effect if assignments changed!
        Object.keys(assignedSources).forEach(sourceId => {
            //Remove any existing assignments
            Object.values(this.roomMinerSystems).forEach(system => {
                if (system !== assignedSources[sourceId]) {
                    system._unregisterSource(sourceId);
                }
            });
            assignedSources[sourceId]._registerSource(sourceId as Id<Source>, getRoomData(sourceRoomNames[sourceId])!);
        });
    }

    _reloadActiveMiningJobs() {
        Object.values(this.roomMinerSystems).forEach(s => s._reloadActiveMiningJobs());
    }

    _reloadAllConfigs() {
        // Log.d("Reloading miner configs");
        Object.values(this.roomMinerSystems).forEach(s => s._reloadAllConfigs());
    }

    _reloadAllPaths() {
        // Log.d("Reloading paths");
        Object.values(this.roomMinerSystems).forEach(s => s._reloadAllPathInfo());
    }

    _runCreeps() {
        // Log.d(`Running ${Object.values(this.roomMinerSystems).length} mining systems for creeps`);
        Object.values(this.roomMinerSystems).forEach(s => s._runCreeps());
    }

    _visualize() {
        Object.values(this.roomMinerSystems).forEach(s => s._visualize());
    }
}

export let _shardMinerSystem: ShardMinerSystem = new ShardMinerSystem();
registerResetFunction(() => (_shardMinerSystem = new ShardMinerSystem()));
