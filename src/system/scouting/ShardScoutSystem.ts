/*
    Will create and maintain an undirected graph of rooms and room connections.
    Each node consists of a contiguous group of exits. In most cases, this is the same thing as a room. 
        However, there are some funky terrain cases where a room might not equal a node
    Scouting a new room will consist of the following steps
    1) Identify trivial information:
        Source location
        Mineral information
        Room type (Core room, source keeper room)
        Occupation info (Which player controls the room. How is it controlled? Reserved? Claimed? Military presence?
    2) Identify exits. Loop around the edges of the room checking the terrain mask for the room. 
        if you hit a wall or unpathable structure, consider that the exit. Once we have all the exits defined, proceed
    3) Identify exit connection. Try to path from each exit to every other exit. Use this to build out a reachablility matirix.
        If all exits are connected, the room is considered an open room, and a flag can be set to the effect. The matrix should 
        keep track of whether or not the room is closed due to player structures, closed because of terrain, or open
    4) Determine desirability. If the room is terrain closed, we won't move there. Period. Otherwise, measure some factors
        Openess: How many of the tiles are pathable
        Swampyness: How many of the tiles are swamps
        PathEfficiency: Average path distance between the sources and controller
        RemoteEnergyAvailability: Can't evaluate this until nearby nodes have been explored as well, but this is the average 
            distance to the 6 closest sources. Max range for remoting is 200 tiles. If there are less than 6 in range, the remaining
            slots count as the max range

    Each owned room is responsible for making a couple scouts. 2 scouts max per room should be enough. One will traverse rooms breadth first, 
        the other will traverse depth first. If all rooms have been scouted fairly recently, no scouts will be spawned

    All in all, scouting isn't my biggest concern. I need to make sure it works, but taking a bunch of time to scout efficiently is 
        not needed. 
    */

import { MemoryComponent, memoryWriter } from "utils/MemoryWriter";
import { creepManifest } from "system/spawning/CreepManifest";
import { shardSpawnSystem } from "system/spawning/ShardSpawnSystem";
import { Log } from "utils/logger/Logger";
import { ScoutMemory } from ".";
import { JOB_NAME_SCOUT } from "./ScoutInterface";
import { assignRoomToScout, getRoomsToExplore, runScout, scoutRoom } from "./ScoutLogic";
import { registerResetFunction } from "utils/SystemResetter";

const MAX_SCOUT_DEPTH = 6;
const SCOUTS_PER_CLUSTER = 1;

class ShardScoutSystem implements MemoryComponent {
    private memory?: ScoutMemory;
    private scoutAssignments: { [creepName: string]: string } = {};

    constructor() {
        this.loadMemory();

        //Remove this later
        this.memory!.clusters = _.unique(this.memory!.clusters);
        memoryWriter.updateComponent(this);
    }

    saveMemory(): void {
        if (this.memory) Memory.scoutMemory = this.memory;
    }

    private loadMemory() {
        if (!this.memory) {
            let rootRooms: Room[] = _.unique(Object.values(Game.spawns).map(s => s.room));
            this.memory = Memory.scoutMemory ?? {
                myRoomNames: rootRooms.map(r => r.name),
                shardMap: _.mapKeys(
                    rootRooms.map(room => scoutRoom(room, {})),
                    s => s.roomName
                ),
                clusters: rootRooms.map(r => [r.name])
            };
        }
    }

    //Will flood fill from each claimed room and establish clusters based on reachability. Only considers rooms up to a max recursive depth
    //Will on recreate cluster information, and will be expensive. Only call if you need to.
    public createSuperclusters(): void {
        //Flood fill from parent rooms
    }

    //Will find a cluster with too many rooms. Will divide the cluster into two clusters. Returns true if done and all clusters are sized correctly
    public subdivideSupercluster(): boolean {
        return false;
    }

    public clearDeadCreepAssignments() {
        Object.keys(this.scoutAssignments).forEach(name => {
            if (!Game.creeps[name]) delete this.scoutAssignments[name];
        });
    }

    public registerCreepConfigs(): void {
        this.loadMemory();
        let clusters = this.memory!.clusters;
        let shardMap = this.memory!.shardMap;
        for (let i = 0; i < clusters.length; i++) {
            let toExploreForCluster = getRoomsToExplore(
                clusters[i],
                shardMap,
                Object.values(this.scoutAssignments),
                MAX_SCOUT_DEPTH
            );
            if (toExploreForCluster.length) {
                shardSpawnSystem.registerGlobalCreepConfig({
                    body: [MOVE],
                    handle: "ScoutsForCluster:" + i,
                    jobName: JOB_NAME_SCOUT,
                    quantity: SCOUTS_PER_CLUSTER,
                    dontPrespawnParts: true,
                    desiredRoomPosition: new RoomPosition(25, 25, toExploreForCluster[0])
                });
            } else {
                shardSpawnSystem.unregisterGlobalHandle("ScoutsForCluster:" + i);
            }
        }
    }

    public runCreeps() {
        this.loadMemory();
        let clusters = this.memory!.clusters;
        let shardMap = this.memory!.shardMap;
        for (let i = 0; i < clusters.length; i++) {
            let scoutsForCluster = creepManifest.getCreeps("ScoutsForCluster:" + i);
            for (let scout of scoutsForCluster) {
                if (!this.scoutAssignments[scout.name]) {
                    let assignment = assignRoomToScout(
                        scout,
                        clusters[i],
                        shardMap,
                        Object.values(this.scoutAssignments),
                        MAX_SCOUT_DEPTH
                    );

                    if (assignment) {
                        this.scoutAssignments[scout.name] = assignment;
                    }
                }

                let assignment = this.scoutAssignments[scout.name];
                if (assignment) {
                    let done = runScout(scout, assignment, shardMap);
                    if (done) {
                        Log.i(`${scout.name} has finished scouting ${assignment}`);
                        if (!clusters[i].includes(assignment)) {
                            clusters[i].push(assignment);
                            memoryWriter.updateComponent(this);
                        }
                        delete this.scoutAssignments[scout.name];
                    }
                } else {
                    scout.queueSay("😔💀");
                    scout.suicide();
                    this.registerCreepConfigs();
                }
            }
        }
    }
}

export let shardScoutSystem: ShardScoutSystem = new ShardScoutSystem();
registerResetFunction(() => (shardScoutSystem = new ShardScoutSystem()));
