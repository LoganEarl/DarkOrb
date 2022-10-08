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

    _reloadFocus() {
        Object.values(this.roomWorkSystems).forEach(s => this.determineFocus(s));
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
                let closest = mapData.territoryInfo[0].roomName;
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
                this.updateStructureRepair(bestRoom, lowRamps);

                let lowestWallBucket: (StructureWall | StructureRampart)[] = [];
                let minBucket: number | undefined;
                rampartsAndWalls.forEach(r => {
                    let bucket = Math.floor(r.hits / 10000);
                    if (minBucket === undefined || minBucket > bucket) {
                        minBucket = bucket;
                        lowestWallBucket = [r as StructureWall | StructureRampart];
                    } else if (minBucket === bucket) {
                        lowestWallBucket.push(r as StructureWall | StructureRampart);
                    }
                });
                this.updateWallReinforcement(bestRoom, rampartsAndWalls, minBucket ?? 0);

                if (room.controller?.owner?.username === global.PLAYER_USERNAME) {
                    registerWorkDetail(bestRoom.roomName, {
                        detailId: room.controller!.id,
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
        sites.forEach(site => {
            registerWorkDetail(system.roomName, {
                detailId: site.id,
                detailType: "Construction",
                destPosition: site.pos,
                currentProgress: site.progress,
                targetProgress: site.progressTotal,
                targetId: site.id
            });
        });
    }

    private updateStructureRepair(system: RoomWorkSystem, structures: Structure[]) {
        structures.forEach(structure => {
            registerWorkDetail(system.roomName, {
                detailId: structure.id,
                detailType: "Repair",
                destPosition: structure.pos,
                targetId: structure.id
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
                detailId: wall.id,
                detailType: "Reinforce",
                destPosition: wall.pos,
                currentProgress: wall.hits,
                targetProgress: targetHits,
                targetId: wall.id
            });
        });
    }
    //After each new RCL build for 1000 ticks and until we run out of construction projects
    private determineFocus(system: RoomWorkSystem) {
        let room = Game.rooms[system.roomName];
        //The min time before we can toggle from construction to upgrading
        let minUpdateTime = system.lastFocusUpdate + 1000;
        //What the controller level was last time we checked the focus
        let lastControllerLevel = this.lastControllerLevels[room.name] ?? 0;
        if (room) {
            let hasConstructionJobs = getWorkDetailsOfType(room.name, "Construction").length > 0;
            //Start off the room by upgrading to rcl 2
            if (room.controller!.level === 1) {
                system.focus = "Upgrade";
            } else if (hasConstructionJobs) {
                system.focus = "Construction";
            }
            //If we just now upgraded switch over to building new buildings
            else if (lastControllerLevel != room.controller!.level) {
                system.focus = "Construction";
                this.lastControllerLevels[room.name] = room.controller!.level;
            }
            //Check if we finished the construction period and need to move onto pushing for the next upgrade
            else if (Game.time > minUpdateTime) {
                let doneBuilding = !hasConstructionJobs;
                if (room.controller!.level < 8 && doneBuilding) {
                    system.focus = "Upgrade";
                }

                //No point in focusing once we hit max
                else if (room.controller!.level === 8 && doneBuilding) {
                    system.focus = "None";
                }
            }
        }
    }
}

export let _shardWorkerSystem: ShardWorkerSystem = new ShardWorkerSystem();
registerResetFunction(() => (_shardWorkerSystem = new ShardWorkerSystem()));
