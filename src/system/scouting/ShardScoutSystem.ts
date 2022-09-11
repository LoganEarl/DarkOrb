import { MemoryComponent, memoryWriter } from "utils/MemoryWriter";
import { Log } from "utils/logger/Logger";
import { assignRoomToScout, getRoomsToExplore, runScout, scoutRoom } from "./ScoutLogic";
import { registerResetFunction } from "utils/SystemResetter";
import { getCreeps, registerCreepConfig, unregisterHandle } from "system/spawning/SpawnInterface";
import { unpackCoord, unpackPos } from "utils/Packrat";
import { hslToHex } from "utils/UtilityFunctions";

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
                    rootRooms.map(room => scoutRoom(room, {}, MAX_SCOUT_DEPTH)),
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

    //Registers room ownership to us, if there is no other form of ownership present.
    _claimEconomically() {}

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
            let handle = "ScoutsForCluster:" + i;
            if (toExploreForCluster.length) {
                registerCreepConfig(handle, [
                    {
                        body: [MOVE],
                        handle: handle,
                        jobName: "Aspect",
                        quantity: SCOUTS_PER_CLUSTER,
                        dontPrespawnParts: true,
                        desiredRoomPosition: new RoomPosition(25, 25, toExploreForCluster[0])
                    }
                ]);
            } else {
                unregisterHandle(handle);
            }
        }
    }

    _visualize() {
        this.loadMemory();
        let clusters = this.memory!.clusters;

        for (let i = 0; i < clusters.length; i++) {
            let clusterColor = hslToHex((i / clusters.length) * 360, 100, 50);
            for (let roomName of clusters[i]) {
                let pathingInfo = this._getMapData(roomName)?.pathingInfo;
                if (pathingInfo?.packedRallyPos) {
                    let pos = unpackPos(pathingInfo.packedRallyPos);
                    Game.map.visual.circle(pos, { radius: 1.5, stroke: clusterColor, fill: clusterColor });
                    pathingInfo.pathableExits
                        .map(roomName => this._getMapData(roomName)?.pathingInfo?.packedRallyPos)
                        .filter(p => p)
                        .map(p => unpackPos(p!))
                        .forEach(p => Game.map.visual.line(pos, p, { color: clusterColor }));
                }
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
                    let done = runScout(scout, assignment, shardMap, MAX_SCOUT_DEPTH);
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

export let _shardScoutSystem: ShardScoutSystem = new ShardScoutSystem();
registerResetFunction(() => (_shardScoutSystem = new ShardScoutSystem()));
