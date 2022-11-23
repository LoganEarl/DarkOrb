import { getRoomData } from "system/scouting/ScoutInterface";
import { getMainStorage } from "system/storage/StorageInterface";
import { Log } from "utils/logger/Logger";
import { registerResetFunction } from "utils/SystemResetter";
import { RoomWorkSystem } from "./RoomWorkerSystem";
import { getWorkDetailsOfType, registerWorkDetail } from "./WorkInterface";

const SCAN_INTERVAL = 20;

class ShardWorkerSystem {
    private roomWorkSystems: { [roomName: string]: RoomWorkSystem } = {};
    private lastWorkScan: { [roomName: string]: number } = {};

    //Keep track of the current controller levels so we can tell when they change
    private lastControllerLevels: { [roomName: string]: number } = {};

    _scanWorkSystems() {
        // Log.d("Rescanning work rooms");
        //Check for registered rooms that are dead
        for (let system of Object.values(this.roomWorkSystems)) {
            if (!Game.rooms[system.roomName] || !Game.rooms[system.roomName].controller?.my) {
                Log.w(
                    `Unregistering work system in room:${system.roomName} as the controller is no longer under our control`
                );
            }
        }

        //Check for new or unregistered rooms
        for (let room of Object.values(Game.rooms)) {
            if (room.controller?.my && !this.roomWorkSystems[room.name]) {
                Log.i("Creating work system for room: " + room.name);
                this.roomWorkSystems[room.name] = new RoomWorkSystem(room.name);
            }
        }
    }

    _runCreeps() {
        Object.values(this.roomWorkSystems).forEach(s => s._runCreeps());
    }

    _reloadConfigs() {
        Object.values(this.roomWorkSystems).forEach(s => s._reloadConfigs());
    }

    _visualize() {
        Object.values(this.roomWorkSystems).forEach(s => s._visualize());
    }

    _scanForWork() {
        for (let roomName in Game.rooms) {
            let room = Game.rooms[roomName];
            let lastScan = this.lastWorkScan[roomName];
            let mapData = getRoomData(roomName);

            //If we own the room and havent scanned it recently
            if (
                mapData?.ownership?.username === global.PLAYER_USERNAME &&
                (!lastScan || lastScan > Game.time - SCAN_INTERVAL)
            ) {
                //Send the job to whichever room is closest
                let closest = mapData.territoryInfo.claims[0].roomName;
                let bestRoom = this.roomWorkSystems[closest];

                let structures = room.find(FIND_STRUCTURES);

                let constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
                this.updateCSites(bestRoom, constructionSites);

                let repairBuildings = structures.filter(
                    s =>
                        s.hits < s.hitsMax * 0.5 &&
                        s.structureType !== STRUCTURE_RAMPART &&
                        s.structureType !== STRUCTURE_WALL &&
                        s.structureType !== STRUCTURE_CONTROLLER
                );
                this.updateStructureRepair(bestRoom, repairBuildings);

                let rampartsAndWalls = structures
                    .filter(s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL)
                    .map(s => s as StructureWall | StructureRampart);

                let lowRamps = rampartsAndWalls.filter(s => s.structureType === STRUCTURE_RAMPART && s.hits < 10000);
                this.updateLowRampRepair(bestRoom, lowRamps);

                let reinforementTargets = rampartsAndWalls.filter(
                    r => r.structureType !== STRUCTURE_RAMPART || r.hits > 10000
                );
                let lowestWallBucket: (StructureWall | StructureRampart)[] = [];
                let minBucket: number | undefined;

                reinforementTargets.forEach(r => {
                    let bucket = Math.floor(r.hits / 10000);
                    if (minBucket === undefined || minBucket > bucket) {
                        minBucket = bucket;
                        lowestWallBucket = [r as StructureWall | StructureRampart];
                    } else if (minBucket === bucket) {
                        lowestWallBucket.push(r as StructureWall | StructureRampart);
                    }
                });
                this.updateWallReinforcement(bestRoom, reinforementTargets, minBucket ?? 0);

                if (room.controller?.owner?.username === global.PLAYER_USERNAME) {
                    registerWorkDetail(bestRoom.roomName, {
                        detailId: "Upgrade:" + room.controller!.id,
                        detailType: "Upgrade",
                        targetStructureType: STRUCTURE_CONTROLLER,
                        destPosition: room.controller!.pos,
                        targetId: room.controller!.id
                    });
                }

                break; //only scan one room per tick
            }
        }
    }

    private updateCSites(system: RoomWorkSystem, sites: ConstructionSite[]) {
        if(sites.length)
            registerWorkDetail(system.roomName, {
                detailId: "Construct:" + system.roomName,
                detailType: "Construction",
                currentProgress: site.progress,
                targetProgress: site.progressTotal,
                targetId: site.id
            });
        });
    }

    private updateStructureRepair(system: RoomWorkSystem, structures: Structure[]) {
        structures.forEach(structure => {
            registerWorkDetail(system.roomName, {
                detailId: "Repair:" + structure.id,
                detailType: "Repair",
                destPosition: structure.pos,
                targetId: structure.id
            });
        });
    }

    private updateLowRampRepair(system: RoomWorkSystem, structures: Structure[]) {
        structures.forEach(structure => {
            registerWorkDetail(system.roomName, {
                detailId: "RepairRamp:" + structure.id,
                detailType: "Repair",
                destPosition: structure.pos,
                targetProgress: 15000,
                currentProgress: structure.hits,
                targetId: structure.id,
                targetStructureType: STRUCTURE_RAMPART
            });
        });
    }

    private updateWallReinforcement(
        system: RoomWorkSystem,
        walls: (StructureWall | StructureRampart)[],
        bucket: number
    ) {
        let targetHits = (bucket + 1) * 10000 + 5000;
        walls.forEach(wall => {
            registerWorkDetail(system.roomName, {
                detailId: "Reinforce:" + wall.id,
                detailType: "Reinforce",
                destPosition: wall.pos,
                currentProgress: wall.hits,
                targetProgress: targetHits,
                targetId: wall.id
            });
        });
    }
}

export let _shardWorkerSystem: ShardWorkerSystem = new ShardWorkerSystem();
registerResetFunction(() => (_shardWorkerSystem = new ShardWorkerSystem()));
