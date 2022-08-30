import { MemoryComponent, memoryWriter } from "utils/MemoryWriter";
import { Log } from "utils/logger/Logger";
import { assignRoomToScout, getRoomsToExplore, runScout, scoutRoom } from "./ScoutLogic";
import { registerResetFunction } from "utils/SystemResetter";
import { getCreeps, registerCreepConfig, unregisterHandle } from "system/spawning/SpawnInterface";

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

    _getMapData(roomName: string): RoomScoutingInfo | undefined {
        this.loadMemory();
        return this.memory!.shardMap[roomName];
    }

    //Will flood fill from each claimed room and establish clusters based on reachability. Only considers rooms up to a max recursive depth
    //Will on recreate cluster information, and will be expensive. Only call if you need to.
    _createSuperclusters(): void {
        //Flood fill from parent rooms
    }

    //Will find a cluster with too many rooms. Will divide the cluster into two clusters. Returns true if done and all clusters are sized correctly
    _subdivideSupercluster(): boolean {
        return false;
    }

    _clearDeadCreepAssignments() {
        Object.keys(this.scoutAssignments).forEach(name => {
            if (!Game.creeps[name]) delete this.scoutAssignments[name];
        });
    }

    _registerCreepConfigs(): void {
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
                registerCreepConfig({
                    body: [MOVE],
                    handle: "ScoutsForCluster:" + i,
                    jobName: "Aspect",
                    quantity: SCOUTS_PER_CLUSTER,
                    dontPrespawnParts: true,
                    desiredRoomPosition: new RoomPosition(25, 25, toExploreForCluster[0])
                });
            } else {
                unregisterHandle("ScoutsForCluster:" + i);
            }
        }
    }

    _runCreeps() {
        this.loadMemory();
        let clusters = this.memory!.clusters;
        let shardMap = this.memory!.shardMap;
        for (let i = 0; i < clusters.length; i++) {
            let scoutsForCluster = getCreeps("ScoutsForCluster:" + i);
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
                    this._registerCreepConfigs();
                }
            }
        }
    }
}

export let shardScoutSystem: ShardScoutSystem = new ShardScoutSystem();
registerResetFunction(() => (shardScoutSystem = new ShardScoutSystem()));
