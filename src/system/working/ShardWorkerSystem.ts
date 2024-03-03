import {Log} from "utils/logger/Logger";
import {RoomWorkSystem} from "./RoomWorkerSystem";
import {getRoomData} from "../scouting/ScoutInterface";
import {deleteWorkDetail, getWorkDetailById, registerWorkDetail} from "./WorkerInterface";
import {registerResetFunction} from "../../utils/SystemResetter";
import {roomPos} from "../../utils/UtilityFunctions";
import {packPos} from "../../utils/Packrat";

const SCAN_INTERVAL = 20;
const RAMP_BUCKET_SIZE = 40000;
//How much over the current bucket we will upgrade a given ramp before calling it good
const RAMP_BUCKET_BUFFER = 10000;

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
        //TODO this will all be replaced eventually. The idea being that the system in charge of
        // each of these building types should be responsible for creating the work details. For now
        // though, this will work.
        for (let roomName in Game.rooms) {
            let room = Game.rooms[roomName];
            let lastScan = this.lastWorkScan[roomName];
            let mapData = getRoomData(roomName);

            //If we own the room and havent scanned it recently
            if (
                mapData?.ownership?.username === global.PLAYER_USERNAME &&
                (!lastScan || lastScan > Game.time - SCAN_INTERVAL)
            ) {
                this.lastWorkScan[roomName] = Game.time;
                //Send the job to whichever room is closest
                let closest = mapData.territoryInfo.claims[0].roomName;
                let bestRoom = this.roomWorkSystems[closest];

                let upgraderPositions = mapData?.roomPlan?.upgraderPositions;
                if (upgraderPositions && room.controller?.owner?.username === global.PLAYER_USERNAME) {
                    this.updateControllerUpgrades(room, upgraderPositions);
                }

                let constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
                this.updateCSites(bestRoom, constructionSites);

                let structures = room.find(FIND_STRUCTURES);
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

                let lowRamps = rampartsAndWalls
                    .filter(s => s.structureType === STRUCTURE_RAMPART && s.hits < RAMP_BUCKET_BUFFER);
                this.updateLowRampRepair(bestRoom, lowRamps);


                let reinforcementTargets = rampartsAndWalls.filter(
                    r => r.structureType !== STRUCTURE_RAMPART || r.hits > RAMP_BUCKET_SIZE
                );
                let lowestWallBucket: (StructureWall | StructureRampart)[] = [];
                let minBucket: number | undefined;

                reinforcementTargets.forEach(r => {
                    let bucket = Math.floor(r.hits / RAMP_BUCKET_SIZE);
                    if (minBucket === undefined || minBucket > bucket) {
                        minBucket = bucket;
                        lowestWallBucket = [r as StructureWall | StructureRampart];
                    } else if (minBucket === bucket) {
                        lowestWallBucket.push(r as StructureWall | StructureRampart);
                    }
                });
                this.updateWallReinforcement(bestRoom, lowestWallBucket, minBucket ?? 0);
            }
        }
    }

    private updateControllerUpgrades(room: Room, upgraderPositions: Coord[]) {
        let countWorkTargets = 0;
        let workDetailId = "Upgrade:" + room.controller!.id
        let existingWorkDetail = getWorkDetailById(room.name, workDetailId)
        let workTargets: { [targetId: string]: WorkTarget } = existingWorkDetail?.targets ?? {};
        for (let pos of upgraderPositions ?? []) {
            let targetId = `${pos.x}:${pos.y}:${!room.controller!.id}`
            if(workTargets[targetId]) {
                workTargets[targetId].currentProgress = room.controller!.progress
            } else {
                workTargets[targetId] = {
                    currentProgress: room.controller!.progress,
                    gameObjectId: room.controller!.id,
                    gameObjectType: STRUCTURE_CONTROLLER,
                    packedPosition: packPos(roomPos(pos, room.name)),
                    targetId: targetId,
                    targetProgress: workTargets[targetId]?.targetProgress ?? Math.min(room.controller!.progressTotal, room.controller!.progress + 1000)
                }
            }
            countWorkTargets++;
        }

        if (countWorkTargets) {
            if (!existingWorkDetail) {
                registerWorkDetail(room.name, {
                    detailId: "Upgrade:" + room.controller!.id,
                    maxCreeps: countWorkTargets,
                    maxWorkParts: 0,
                    parentRoom: room.name,
                    primaryPool: "Upgraders",
                    priority: "Normal",
                    workerPools: ["Upgraders"],
                    detailType: "Upgrade",
                    targets: workTargets
                });
            }
        } else {
            deleteWorkDetail(room.name, workDetailId)
        }
    }

    private updateCSites(system: RoomWorkSystem, sites: ConstructionSite[]) {
        let workDetailId = "ConstructBuildings:" + system.roomName
        if (sites.length) {
            let targets: { [targetId: string]: WorkTarget } = {};
            for (let site of sites) {
                let targetId = site.id;
                targets[targetId] = {
                    currentProgress: site.progress,
                    gameObjectId: site.id,
                    gameObjectType: site.structureType,
                    packedPosition: packPos(site.pos),
                    targetId: targetId,
                    targetProgress: site.progressTotal
                }
            }
            registerWorkDetail(system.roomName, {
                detailId: workDetailId,
                maxCreeps: 10,
                maxWorkParts: 0,
                parentRoom: system.roomName,
                primaryPool: "Workers",
                priority: "Normal",
                workerPools: ["Workers", "Upgraders"],
                detailType: "Construction",
                targets: targets
            });
        } else {
            deleteWorkDetail(system.roomName, workDetailId)
        }
    }


    private updateStructureRepair(system: RoomWorkSystem, structures: Structure[]) {
        let workDetailId = "RepairStructures" + system.roomName
        let existingDetail = getWorkDetailById(system.roomName, workDetailId )
        if (structures.length) {
            let targets: { [targetId: string]: WorkTarget } = existingDetail?.targets ?? {};
            for (let structure of structures) {
                targets[structure.id] = {
                    currentProgress: structure.hits,
                    gameObjectId: structure.id,
                    gameObjectType: structure.structureType,
                    packedPosition: packPos(structure.pos),
                    targetId: structure.id,
                    targetProgress: structure.hitsMax
                }
            }

            if (!existingDetail) {
                registerWorkDetail(system.roomName, {
                    detailId: workDetailId,
                    detailType: "Repair",
                    maxCreeps: 0,
                    maxWorkParts: 0,
                    parentRoom: "",
                    primaryPool: "Workers",
                    priority: "Elevated",
                    targets: targets,
                    workerPools: ["Workers", "EmergencyRepairers"]
                });
            }
        } else if (Object.values(existingDetail?.targets ?? {}).length === 0) {
            deleteWorkDetail(system.roomName, workDetailId)
        }
    }

    private updateLowRampRepair(system: RoomWorkSystem, structures: Structure[]) {
        let workDetailId = "HomeRoomLowRampRepair";
        let existingWorkDetail = getWorkDetailById(system.roomName, workDetailId)
        if (structures.length) {
            let targets: { [targetId: string]: WorkTarget } = existingWorkDetail?.targets ?? {};
            for (let lowRamp of structures) {
                targets[lowRamp.id] = {
                    currentProgress: lowRamp.hits,
                    gameObjectId: lowRamp.id,
                    gameObjectType: STRUCTURE_RAMPART,
                    packedPosition: packPos(lowRamp.pos),
                    targetId: lowRamp.id,
                    targetProgress: RAMP_BUCKET_SIZE + RAMP_BUCKET_SIZE,
                }
            }
            if (!existingWorkDetail) {
                registerWorkDetail(system.roomName, {
                    detailId: workDetailId,
                    detailType: "RampartRepair",
                    maxCreeps: 1,
                    maxWorkParts: 1,
                    parentRoom: system.roomName,
                    primaryPool: "Workers",
                    priority: "Elevated",
                    targets: targets,
                    workerPools: ["Workers", "EmergencyRepairers"]
                });
            }
        } else if (Object.values(existingWorkDetail?.targets ?? {}).length === 0){
            deleteWorkDetail(system.roomName, workDetailId);
        }
    }

    private updateWallReinforcement(
        system: RoomWorkSystem,
        walls: (StructureWall | StructureRampart)[],
        bucket: number
    ) {
        let targetHits = (bucket + 1) * RAMP_BUCKET_SIZE + RAMP_BUCKET_BUFFER;
        let detailId = "RampReinforcement:" + system.roomName;
        let existingDetail = getWorkDetailById(system.roomName, detailId);
        let targets: { [targetId: string]: WorkTarget } = existingDetail?.targets ?? {};

        if (walls.length) {
            for (let wall of walls) {
                let targetId = "WallReinforcement:" + wall.id
                targets[targetId] = {
                    currentProgress: wall.hits,
                    gameObjectId: wall.id,
                    gameObjectType: wall.structureType,
                    packedPosition: packPos(wall.pos),
                    targetId: targetId,
                    targetProgress: targetHits

                }
            }

            if (!existingDetail) {
                registerWorkDetail(system.roomName, {
                    detailId: detailId,
                    detailType: "Reinforce",
                    maxCreeps: 0,
                    maxWorkParts: 0,
                    parentRoom: system.roomName,
                    primaryPool: "Workers",
                    priority: "Low",
                    targets: targets,
                    workerPools: ["Workers", "Upgraders", "EmergencyRepairers"]
                });
            }
        } else {
            deleteWorkDetail(system.roomName, detailId)
        }
    }
}

export let _shardWorkerSystem: ShardWorkerSystem = new ShardWorkerSystem();
registerResetFunction(() => (_shardWorkerSystem = new ShardWorkerSystem()));
