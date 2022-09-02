import { getMapData } from "system/scouting/ScoutInterface";
import { bodyCost, maximizeBody, maximizeBodyForTargetParts } from "system/spawning/SpawnInterface";
import { getMainStorage } from "system/storage/StorageInterface";
import { packPos } from "utils/Packrat";
import { ROOMTYPE_CORE, ROOMTYPE_SOURCEKEEPER, Traveler } from "utils/traveler/Traveler";

export function _calcualteMiningPath(start: RoomPosition, end: RoomPosition): PathFinderPath {
    //Remember, this is for determining how hard the path is curently. This is NOT for plotting a road
    return Traveler.findTravelPath(start, end, {
        plainCost: 2,
        range: 0, //This is for pathing to a free space, not to the source so range is 0
        ignoreRoads: false,
        ignoreStructures: false
    });
}

//Reloads our pathCost and pathLength fields. Also detects when the mining path becomes blocked off
export function _findPathToFreeSpace(freeSpaces: RoomPosition[], storagePos: RoomPosition): PathFinderPath | undefined {
    if (freeSpaces.length > 1) {
        //Plains will cost 2 and roads 1.
        let path = _calcualteMiningPath(storagePos, freeSpaces[0]);
        return !path.incomplete ? path : undefined;
    } else if (freeSpaces.length === 1) {
        let pathsBySpace: { [packedSpace: string]: PathFinderPath } = {};
        freeSpaces.forEach(space => (pathsBySpace[packPos(space)] = _calcualteMiningPath(storagePos, space)));

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

export function _designCreepsForSource(
    handle: string,
    maxMiningSpots: number,
    parentRoom: Room,
    pathLength: number,
    mapData: RoomScoutingInfo
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

    return bodies.map(body => {
        return {
            body: body,
            handle: handle,
            jobName: "Exhumer",
            quantity: 1,
            additionalPrespawntime: pathLength
        };
    });
}

export function _designCreepsForMineral(
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

//Recursivly traverses scouting data, finds all sources in the given range (in rooms) to the source room
export function _findAllSourcesInRange(
    sourceRoom: RoomScoutingInfo | undefined,
    range: number,
    countMyClaimedRooms: boolean,
    visited?: Set<String>
): SourceInfo[] {
    if (!sourceRoom || range <= -1) return [];

    let ownedByEnemy = sourceRoom.ownership && sourceRoom.ownership.username !== global.PLAYER_USERNAME;

    //Dont traverse if we don't own the room
    if (ownedByEnemy) return [];

    let claimedByMe =
        sourceRoom.ownership &&
        sourceRoom.ownership.username === global.PLAYER_USERNAME &&
        sourceRoom.ownership.ownershipType === "Claimed";

    //Can't remote mine from neighnoring rooms I also own
    if (claimedByMe && !countMyClaimedRooms) return [];

    if (!visited) visited = new Set();

    let sources: SourceInfo[] = sourceRoom.miningInfo?.sources ?? [];
    let exits = sourceRoom.pathingInfo?.pathableExits ?? [];
    visited.add(sourceRoom.roomName);
    exits.forEach(exitRoomName => {
        if (!visited!.has(exitRoomName)) {
            sources.push(..._findAllSourcesInRange(getMapData(exitRoomName), range - 1, false, visited));
        }
    });
    return sources;
}
