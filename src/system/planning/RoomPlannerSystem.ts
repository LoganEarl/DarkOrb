import { getRoomData } from "system/scouting/ScoutInterface";
import { Log } from "utils/logger/Logger";
import { findStructure } from "utils/StructureFindCache";

export class RoomPlannerSystem {
    public roomName: string;

    constructor(roomName: string) {
        this.roomName = roomName;
    }

    _queueJobs(remainingSites: number) {
        let plan = getRoomData(this.roomName)?.roomPlan;
        let room = Game.rooms[this.roomName];
        let controller = room?.controller;
        if (room && controller && plan?.fastFiller) {
            let remainingBuildings = this.establishBuildLimits(room);
            let structures = this.mapExistingStructures(room);

            //Check the fast filler. Keep track of the cSites we place
            remainingSites -= this.planGroup(
                room,
                controller.level,
                plan.fastFiller,
                structures,
                remainingSites,
                remainingBuildings
            );

            //Check the extension pods until we run out of extensions
            for (let podIndex = 0; podIndex < plan.extensionPods!.length && remainingSites > 0; podIndex++) {
                remainingSites -= this.planGroup(
                    room,
                    controller.level,
                    plan.extensionPods![podIndex],
                    structures,
                    remainingSites,
                    remainingBuildings
                );
            }

            //Check the storage core
            remainingSites -= this.planGroup(
                room,
                controller.level,
                plan.storageCore!,
                structures,
                remainingSites,
                remainingBuildings
            );

            if (controller.level >= 3) {
                //Check the road paths
                remainingSites -= this.planStructuresByCoord(
                    room,
                    plan.roadPositions!,
                    STRUCTURE_ROAD,
                    structures,
                    remainingSites,
                    remainingBuildings
                );
            }
            if (controller.level >= 4) {
                //Check the ramparts
                remainingSites -= this.planStructuresByCoord(
                    room,
                    plan.wallPositions!,
                    STRUCTURE_RAMPART,
                    structures,
                    remainingSites,
                    remainingBuildings
                );
            }
        }
    }

    private planGroup(
        room: Room,
        rcl: number,
        group: PlacedStructureGroup,
        structures: BuildableStructureConstant[][][],
        remainingSites: number,
        remainingBuildings: { [type: string]: number }
    ) {
        if (remainingSites === 0) return 0;

        let toBuild = group.group[rcl].buildings;
        let groupSize = toBuild.length;
        let placed = 0;
        for (let y = 0; y < groupSize; y++) {
            let yPos = y + group.dy;
            for (let x = 0; x < groupSize; x++) {
                let xPos = x + group.dx;

                for (let buildable of toBuild[y]?.[x] ?? []) {
                    if (remainingSites - placed <= 0) return placed;

                    if (!structures[yPos]?.[xPos]?.includes(buildable) && remainingBuildings[buildable] > 0) {
                        let result = room.createConstructionSite(xPos, yPos, buildable);
                        if (result === OK) {
                            if (!structures[yPos]) structures[yPos] = [];
                            if (!structures[yPos][xPos]) structures[yPos][xPos] = [];
                            structures[yPos][xPos].push(buildable);
                            placed++;
                            remainingBuildings[buildable]--;
                            break;
                        } else {
                            Log.w(
                                `Failed to place a construction site for ${buildable} at x:${xPos} y:${yPos} r:${room.name} with code ${result}`
                            );
                        }
                    }
                }
            }
        }

        return placed;
    }

    private planStructuresByCoord(
        room: Room,
        coords: Coord[],
        structureType: BuildableStructureConstant,
        structures: BuildableStructureConstant[][][],
        remainingSites: number,
        remainingBuildings: { [type: string]: number }
    ): number {
        let placed = 0;
        for (let i = 0; i < coords.length && remainingSites > 0 && remainingBuildings[structureType] > 0; i++) {
            let coord = coords[i];
            if (!structures[coord.y]?.[coord.x]?.includes(structureType)) {
                room.createConstructionSite(coord.x, coord.y, structureType);
                remainingSites--;
                placed++;
                remainingBuildings[structureType]--;
                if (!structures[coord.y]) structures[coord.y] = [];
                if (!structures[coord.y][coord.x]) structures[coord.y][coord.x] = [];
                structures[coord.y][coord.x].push(structureType);
            }
        }
        return placed;
    }

    private mapExistingStructures(room: Room): BuildableStructureConstant[][][] {
        let result: BuildableStructureConstant[][][] = [];
        let buildings = findStructure(room, FIND_STRUCTURES);

        let buildables = Object.keys(CONSTRUCTION_COST).map(s => s as string);

        buildings.forEach(b => {
            if (buildables.includes(b.structureType)) {
                if (!result[b.pos.y]) result[b.pos.y] = [];
                if (!result[b.pos.y][b.pos.x]) result[b.pos.y][b.pos.x] = [];
                result[b.pos.y][b.pos.x].push(b.structureType as BuildableStructureConstant);
            }
        });

        let cSites = room.find(FIND_MY_CONSTRUCTION_SITES);
        cSites.forEach(site => {
            if (!result[site.pos.y]) result[site.pos.y] = [];
            if (!result[site.pos.y][site.pos.x]) result[site.pos.y][site.pos.x] = [];
            result[site.pos.y][site.pos.x].push(site.structureType);
        });
        return result;
    }

    private establishBuildLimits(room: Room): { [type: string]: number } {
        let buildingsRemaining: { [type: string]: number } = {};
        Object.keys(CONTROLLER_STRUCTURES)
            .map(s => s as string)
            .forEach(s => {
                buildingsRemaining[s] = CONTROLLER_STRUCTURES[s as BuildableStructureConstant][room.controller!.level];
            });

        //Subtract built structures
        findStructure(room, FIND_STRUCTURES)
            .map(s => s.structureType as string)
            .forEach(s => {
                buildingsRemaining[s]--;
            });

        //Subtract construction sites
        room.find(FIND_MY_CONSTRUCTION_SITES).forEach(site => {
            buildingsRemaining[site.structureType]--;
        });

        return buildingsRemaining;
    }
}
