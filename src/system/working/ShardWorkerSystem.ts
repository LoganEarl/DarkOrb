import { getMapData } from "system/scouting/ScoutInterface";
import { getMainStorage } from "system/storage/StorageInterface";
import { Log } from "utils/logger/Logger";
import { registerResetFunction } from "utils/SystemResetter";
import { RoomWorkSystem } from "./RoomWorkerSystem";

const SCAN_INTERVAL = 20;

class ShardWorkerSystem {
    private roomWorkSystems: { [roomName: string]: RoomWorkSystem } = {};
    private lastWorkScan: { [roomName: string]: number } = {};

    _scanWorkSystems() {
        Log.d("Rescanning work rooms");
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
            let mapData = getMapData(roomName);

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
                    bestRoom._updateWorkDetail({
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
            system._updateWorkDetail({
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
            system._updateWorkDetail({
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
            system._updateWorkDetail({
                detailId: wall.id,
                detailType: "Reinforce",
                destPosition: wall.pos,
                currentProgress: wall.hits,
                targetProgress: targetHits,
                targetId: wall.id
            });
        });
    }

    private determineFocus(system: RoomWorkSystem) {
        let room = Game.rooms[system.roomName];
        if (room) {
            if (room.controller!.level === 1) system._setFocus("Upgrade");
            else if (getMainStorage(system.roomName)?.structureType === STRUCTURE_SPAWN)
                system._setFocus("Construction");
        }
    }
}

export let _shardWorkerSystem: ShardWorkerSystem = new ShardWorkerSystem();
registerResetFunction(() => (_shardWorkerSystem = new ShardWorkerSystem()));
