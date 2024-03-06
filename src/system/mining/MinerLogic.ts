import {getRoomData} from "system/scouting/ScoutInterface";
import {bodyCost, maximizeBody, maximizeBodyForTargetParts} from "system/spawning/SpawnInterface";
import {ANALYTICS_CONSTRUCTION} from "system/storage/AnalyticsConstants";
import {postAnalyticsEvent} from "system/storage/StorageInterface";
import {packPos} from "utils/Packrat";
import {ROOMTYPE_CORE, ROOMTYPE_SOURCEKEEPER, Traveler} from "utils/traveler/Traveler";
import {samePos} from "utils/UtilityFunctions";
import {profile} from "../../utils/profiler/Profiler";

@profile
class MinerLogic {
    _calculateMiningPath(start: RoomPosition, end: RoomPosition): PathFinderPath {
        //Remember, this is for determining how hard the path is curently. This is NOT for plotting a road
        return Traveler.findTravelPath(start, end, {
            plainCost: 2,
            range: 1,
            ignoreRoads: false,
            ignoreStructures: false
        });
    }

    //Reloads our pathCost and pathLength fields. Also detects when the mining path becomes blocked off
    _findPathToFreeSpace(freeSpaces: RoomPosition[], storagePos: RoomPosition): PathFinderPath | undefined {
        if (freeSpaces.length > 1) {
            //Plains will cost 2 and roads 1.
            let path = this._calculateMiningPath(storagePos, freeSpaces[0]);
            return !path.incomplete ? path : undefined;
        } else if (freeSpaces.length === 1) {
            let pathsBySpace: { [packedSpace: string]: PathFinderPath } = {};
            freeSpaces.forEach(space => (pathsBySpace[packPos(space)] = this._calculateMiningPath(storagePos, space)));

            //Filter out blocked spaces
            freeSpaces = freeSpaces.filter(space => !pathsBySpace[packPos(space)].incomplete);

            //Sort them so that the free space at index 0 is the closest. Comes in handy later
            freeSpaces.sort((a, b) => pathsBySpace[packPos(a)].cost - pathsBySpace[packPos(b)].cost);

            //If we still have mining spaces available, set the info
            if (freeSpaces.length > 0) {
                return pathsBySpace[packPos(freeSpaces[0])];
            }
        }
        return undefined;
    }


    _designCreepsForSource(
        handle: string,
        maxMiningSpots: number,
        parentRoom: Room,
        pathLength: number,
        mapData: RoomScoutingInfo,
        priority: number
    ): CreepConfig[] {
        let sourceEnergy: number = SOURCE_ENERGY_NEUTRAL_CAPACITY;
        if (mapData.ownership?.username === global.PLAYER_USERNAME) {
            sourceEnergy = SOURCE_ENERGY_CAPACITY;
        }
        if (mapData.roomType === ROOMTYPE_SOURCEKEEPER || mapData.roomType === ROOMTYPE_CORE) {
            sourceEnergy = SOURCE_ENERGY_KEEPER_CAPACITY;
        }

        let energyPerTick = sourceEnergy / ENERGY_REGEN_TIME;
        let wantedWorkParts = _.ceil(energyPerTick / 2 + 0.1);

        let spawnCapacity = parentRoom.energyCapacityAvailable;
        let bodies: BodyPartConstant[][];

        bodies = maximizeBodyForTargetParts(
            [WORK, WORK, MOVE, MOVE],
            [WORK, MOVE],
            WORK,
            wantedWorkParts,
            spawnCapacity,
            maxMiningSpots
        );

        //Tack on the carry part once we are a bit further past the start and can afford it
        if (bodies.length === 1 && bodyCost(bodies[0]) + 50 < spawnCapacity) {
            bodies[0].push(CARRY);
        }

        // Log.d(
        //     `Planning bodies for mining ${handle}.
        //     ClaimedBy: ${mapData.ownership?.username},
        //     Me: ${global.PLAYER_USERNAME}
        //     E/t: ${energyPerTick}
        //     Work parts: ${wantedWorkParts}
        //     Bodies: ${JSON.stringify(bodies)}
        //     MaxBodies: ${maxMiningSpots}`
        // );

        let subHandle = 0;
        return bodies.map(body => {
            return {
                body: body,
                handle: handle,
                subHandle: `${subHandle++}`,
                jobName: "Exhumer",
                quantity: 1,
                additionalPrespawntime: pathLength,
                subPriority: priority
            };
        });
    }


    _designCreepsForMineral(
        handle: string,
        maxMiningSpots: number,
        parentRoom: Room,
        pathLength: number
    ): CreepConfig {
        let spawnCapacity = parentRoom.energyCapacityAvailable;
        let body = maximizeBody([WORK, WORK, CARRY, MOVE], [WORK, WORK, MOVE], spawnCapacity);
        return {
            body: body,
            handle: handle,
            jobName: "Sludger",
            quantity: maxMiningSpots,
            additionalPrespawntime: pathLength
        };
    }

    //Recursively traverses scouting data, finds all sources in the given range (in rooms) to the source room
    _findAllSourcesInRange(
        sourceRoom: RoomScoutingInfo | undefined,
        range: number,
        countMyClaimedRooms: boolean,
        visited?: Set<String>
    ): SourceInfo[] {
        if (!sourceRoom || range <= -1) return [];

        let ownedByEnemy =
            sourceRoom.ownership &&
            sourceRoom.ownership.ownershipType !== "Unclaimed" &&
            sourceRoom.ownership.username !== global.PLAYER_USERNAME;

        //Dont traverse if we don't own the room
        if (ownedByEnemy) return [];

        let claimedByMe =
            sourceRoom.ownership &&
            sourceRoom.ownership.username === global.PLAYER_USERNAME &&
            sourceRoom.ownership.ownershipType === "Claimed";

        //Can't remote mine from neighnoring rooms I also own
        if (claimedByMe && !countMyClaimedRooms) return [];

        if (!visited) visited = new Set();

        let sources: SourceInfo[] = sourceRoom.miningInfo?.sources.slice() ?? [];
        let exits = sourceRoom.pathingInfo?.pathableExits ?? [];
        visited.add(sourceRoom.roomName);
        exits.forEach(exitRoomName => {
            if (!visited!.has(exitRoomName)) {
                sources.push(...this._findAllSourcesInRange(getRoomData(exitRoomName), range - 1, false, visited));
            }
        });
        return sources;
    }


    _assignMiningSpace(
        creep: Creep,
        possibleSpaces: RoomPosition[],
        mineId: Id<Source | Mineral>,
        existingAssignments: { [creepName: string]: MinerAssignment },
        populationSize: number
    ): MinerAssignment {

        let assignment: MinerAssignment = {
            creepName: creep.name,
            placeToStand: possibleSpaces[0],
            mineId: mineId
        }
        if (populationSize > 1) {
            let usedSpaces = _.min([populationSize, possibleSpaces.length]);
            let occupiedCount: number[] = new Array<number>(usedSpaces);
            let assignedSpaces = Object.values(existingAssignments);
            //Find how many times each possible space was used, and pick the space which is assigned the least times
            let minIndex = 0;
            let min = 999;
            for (let i = 0; i < usedSpaces; i++) {
                occupiedCount[i] = _.sum(assignedSpaces, assignment =>
                    samePos(possibleSpaces[i], assignment.placeToStand) ? 1 : 0
                );
                if (occupiedCount[i] < min) {
                    min = occupiedCount[i];
                    minIndex = i;
                }
            }

            assignment.placeToStand = min < 999 ? possibleSpaces[minIndex] : possibleSpaces[0];
        }

        if (Game.rooms[possibleSpaces[0].roomName]) {
            const structures = assignment.placeToStand.findInRange(FIND_STRUCTURES, 1);
            const sites = assignment.placeToStand.findInRange(FIND_CONSTRUCTION_SITES, 1);
            const links: StructureLink[] = structures
                .filter(s => s.structureType === STRUCTURE_LINK)
                .map(s => s as StructureLink);
            const containers: StructureContainer[] = structures
                .filter(s => s.structureType === STRUCTURE_CONTAINER)
                .map(s => s as StructureContainer);

            assignment.constructionProject = sites[0]?.id;
            assignment.depositContainer = containers[0]?.id;
            assignment.depositLink = links[0]?.id;
        }

        return assignment;
    }


    _runSourceMiner(
        creep: Creep, parentRoomName: string, handle: string, assignment: MinerAssignment, primaryMiner: boolean
    ) {
        if (!samePos(creep.pos, assignment.placeToStand)) {
            Traveler.travelTo(creep, assignment.placeToStand);
        } else {
            Traveler.reservePosition(creep.pos);

            //Start building container
            if (
                primaryMiner &&
                !assignment.constructionProject &&
                !assignment.depositContainer &&
                creep.getActiveBodyparts(CARRY) > 0
            ) {
                let cSite = creep.pos
                    .lookFor(LOOK_CONSTRUCTION_SITES)
                    .filter(c => c.my && c.structureType === STRUCTURE_CONTAINER);
                if (cSite.length) {
                    assignment.constructionProject = cSite[0].id;
                } else {
                    creep.room.createConstructionSite(creep.pos, STRUCTURE_CONTAINER);
                }
            }

            let container: StructureContainer | null = null;
            if (primaryMiner && creep.getActiveBodyparts(CARRY) > 0) {
                if (assignment.constructionProject && creep.store.getUsedCapacity(RESOURCE_ENERGY) >= 30) {
                    let project = Game.getObjectById(assignment.constructionProject);
                    if (project) {
                        creep.queueSay("🔨");
                        creep.build(project);
                        postAnalyticsEvent(
                            parentRoomName,
                            creep.getBodyPower(WORK, "build", BUILD_POWER) * -1,
                            handle,
                            ANALYTICS_CONSTRUCTION
                        );
                        let piles = creep.pos.lookFor(LOOK_ENERGY);
                        if (piles.length) creep.pickup(piles[0]);
                    } else {
                        assignment.constructionProject = undefined;
                    }
                }

                if (assignment.depositContainer) {
                    container = Game.getObjectById(assignment.depositContainer);
                    if (container && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                        if (container.hits < container.hitsMax) {
                            creep.queueSay("🔧");
                            creep.repair(container) === OK;
                            return;
                        }
                    }
                }

                if (assignment.depositLink) {
                    let link = Game.getObjectById(assignment.depositLink);
                    if (link && creep.store.getUsedCapacity(RESOURCE_ENERGY) >= 30) creep.transfer(link, RESOURCE_ENERGY);
                }
            }

            let source = Game.getObjectById(assignment.mineId) as Source;
            if (source.energy > 0) {
                postAnalyticsEvent(parentRoomName, creep.getBodyPower(WORK, "harvest", HARVEST_POWER), handle);
                creep.harvest(source);
            }
        }
    }
}

export const minerLogic: MinerLogic = new MinerLogic();
