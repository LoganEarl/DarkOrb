import { getMapData } from "system/scouting/ScoutInterface";
import { Log } from "utils/logger/Logger";
import { unpackId, unpackPos } from "utils/Packrat";
import { registerResetFunction } from "utils/SystemResetter";
import { _findAllSourcesInRange } from "./MinerLogic";
import { RoomMinerSystem } from "./RoomMinerSystem";

/*
    Need to partition sources to each room. We will have to use scouting data heavily here
        Have each room get a list of nearby source ids, as well as the path length
        We will partition sources to rooms in order of decreasing profits
        Each room will only be allowed to maintain sources up to their spawn capacity.
            This means the spawn systems will need to be able to calcuate spawn cap
            We will also need our room mining systems to be able to evaluate contributed spawn cap
            We will also need a way to evaluate spawn cap using only the path length and estimated e/t
    We will eventually need to support reservers as well
        We won't always be able to spawn reservers though. E capacity and all that
        Reservers will be registered globally. The nearest room that can spawn one will do so. 
        Spawn system needs to partition global creeps to whichever has the most free spawn time
    We will also need some way of sharing road paths too. Something where we repath for the furthest sources first
        and then have a cost matrix that gets updated with the roads we already planned
    Ugh, haulers also exist. Luckily I can steal most of that from the last bot


*/
export class ShardMinerSystem {
    private roomMinerSystems: { [spawnRoomName: string]: RoomMinerSystem } = {};

    //Loop through the spawns, get unique rooms with active spawns, and make sure we have a room miner system for each
    //Remove miner systems we don't have room visibility or spawns in
    public _rescanRooms() {
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
            if (!this.roomMinerSystems[roomName]) this.roomMinerSystems[roomName] = new RoomMinerSystem(roomName);
        });
    }

    //Get all sources, build up pathing info on which sources are close to which rooms. Partition the sources to the rooms
    //This is EXPENSIVE. Don't run it often...
    //TODO this can be optimized by caching distance info to avoid all the path calculation
    public _repartitionMiningRooms() {
        //Get the sources in range to each spawn room
        let sourceInfosPerSpawnRoom: { [spawnRoomName: string]: SourceInfo[] } = {};
        Object.keys(this.roomMinerSystems).forEach(spawnRoom => {
            sourceInfosPerSpawnRoom[spawnRoom] = _findAllSourcesInRange(getMapData(spawnRoom), 2, true);
        });

        //Find the optimal spawn room for each source
        let assignedSources: { [sourceId: string]: RoomMinerSystem } = {};
        let sourceRoomNames: { [sourceId: string]: string } = {};
        Object.keys(sourceInfosPerSpawnRoom).forEach(spawnRoom => {
            let sourcesToAssign: SourceInfo[] = sourceInfosPerSpawnRoom[spawnRoom];
            let roomMinerSystem: RoomMinerSystem = this.roomMinerSystems[spawnRoom];
            sourcesToAssign.forEach(source => {
                let sourceId: Id<Source> = unpackId(source.packedId) as Id<Source>;
                let sourceRoomName = unpackPos(source.packedPosition).roomName;
                sourceRoomNames[sourceId as string] = sourceRoomName;
                let existingAssignment = assignedSources[sourceId as string];

                //We already assigned it. Give it to whomever is closer
                if (existingAssignment) {
                    let mapData: RoomScoutingInfo = getMapData(sourceRoomName)!;
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
            assignedSources[sourceId]._registerSource(sourceId as Id<Source>, getMapData(sourceRoomNames[sourceId])!);
        });
    }

    _reloadActiveMiningJobs() {
        Object.values(this.roomMinerSystems).forEach(s => s._reloadActiveMiningJobs());
    }

    _reloadAllConfigs() {
        Object.values(this.roomMinerSystems).forEach(s => s._reloadAllConfigs());
    }

    _reloadAllPaths() {
        Object.values(this.roomMinerSystems).forEach(s => s._reloadAllPathInfo());
    }

    _visualize() {
        Object.values(this.roomMinerSystems).forEach(s => s._visualize());
    }
}

export let _shardMinerSystem: ShardMinerSystem = new ShardMinerSystem();
registerResetFunction(() => (_shardMinerSystem = new ShardMinerSystem()));
