import { Cluster } from "cluster";
import { distanceTransformDiag } from "utils/algorithms/DistanceTransform";
import { floodFill } from "utils/algorithms/FloodFill";
import { Log } from "utils/logger/Logger";
import { packId, packCoord, packCoordList, unpackCoord } from "utils/Packrat";
import { ROOMTYPE_CONTROLLER, Traveler } from "utils/traveler/Traveler";
import {
    getFreeSpacesNextTo,
    getMultirooomDistance,
    manhattanDistance,
    roomNameFromCoord
} from "utils/UtilityFunctions";
import { ShardMap } from ".";
import {
    SourceInfo,
    MineralInfo,
    RoomMiningInfo,
    RoomOwnershipInfo,
    RoomScoutingInfo,
    RoomThreatInfo,
    ThreatInfo,
    RoomPathingInfo
} from "./ScoutInterface";

function evaluateSources(sources: [Source, ...Source[]]): [SourceInfo, ...SourceInfo[]] {
    if (sources.length == 1) {
        return [
            {
                packedId: packId(sources[0].id),
                packedPosition: packCoord(sources[0].pos.localCoords),
                packedFreeSpots: packCoordList(
                    getFreeSpacesNextTo(sources[0].pos, sources[0].room).map(p => p.localCoords)
                )
            }
        ];
    }

    //Yes I know this is dirty. It is late and I want it to work. also, this like never has to run
    sources.sort((a, b) => getFreeSpacesNextTo(a.pos, a.room).length - getFreeSpacesNextTo(b.pos, b.room).length);

    let freeSpacesBySource: RoomPosition[][] = [];
    for (let i = 0; i < sources.length; i++) {
        freeSpacesBySource[i] = getFreeSpacesNextTo(sources[i].pos, sources[i].room);
    }

    let sourceInfos: [SourceInfo, ...SourceInfo[]] = sources.map(s => {
        return {
            packedId: packId(s.id),
            packedPosition: packCoord(sources[0].pos.localCoords),
            packedFreeSpots: ""
        };
    }) as [SourceInfo, ...SourceInfo[]];

    Log.d("Free spaces by source:" + JSON.stringify(freeSpacesBySource));

    //Add free spaces one at a time to each source. This solves for cases where they have overlaping spots
    let packedUsedSpots: string[] = [];
    let maxFreeSpaces = _.max(freeSpacesBySource, spaces => spaces.length)?.length ?? 0;
    for (let spaceIndex = 0; spaceIndex < maxFreeSpaces; spaceIndex++) {
        Log.d(`looping for free space index ${spaceIndex} of ${maxFreeSpaces}`);
        for (let sourceIndex = 0; sourceIndex < freeSpacesBySource.length; sourceIndex++) {
            let freeSpaces = freeSpacesBySource[sourceIndex];
            Log.d(`Checking source ${sourceIndex}. Found free ${freeSpaces.length} spaces around it`);
            if (spaceIndex < freeSpaces.length) {
                let packedSpace = packCoord(freeSpaces[spaceIndex].localCoords);
                if (!packedUsedSpots.includes(packedSpace)) {
                    packedUsedSpots.push(packedSpace);
                    sourceInfos[sourceIndex].packedFreeSpots += packedSpace;
                    Log.d(`Space was not used. Adding ${packedSpace} to source ${sourceIndex}`);
                }
            }
        }
    }

    return sourceInfos;
}

function evaluateMineral(mineral: Mineral): MineralInfo {
    return {
        packedId: packId(mineral.id),
        packedPosition: packCoord(mineral.pos.localCoords),
        packedFreeSpots: packCoordList(getFreeSpacesNextTo(mineral.pos, mineral.room).map(p => p.localCoords)),
        mineralType: mineral.mineralType
    };
}

function evaluateMining(room: Room): RoomMiningInfo | undefined {
    let sources: Source[] | undefined = room.find(FIND_SOURCES);
    let mineral: Mineral[] | undefined = room.find(FIND_MINERALS);

    if (!sources?.length || !mineral?.length) return undefined;

    return {
        //Safe to cast here. We already checked the length
        sources: evaluateSources(sources as [Source, ...Source[]]),
        mineral: evaluateMineral(mineral[0])
    };
}

function evaluateOwnership(room: Room): RoomOwnershipInfo | undefined {
    if (!room.controller?.owner && !room.controller?.reservation) return undefined;

    let ownerName = room.controller.owner?.username ?? room.controller.reservation!.username;
    return {
        lastUpdated: Game.time,
        username: ownerName,
        rcl: room.controller.level,
        ownershipType: room.controller.owner ? "Claimed" : "Reserved"
    };
}

const DANGEROUS_PARTS: BodyPartConstant[] = [RANGED_ATTACK, ATTACK, HEAL];
const DANGEROUS_PARTS_OWNED_ROOM: BodyPartConstant[] = [RANGED_ATTACK, ATTACK, HEAL, WORK, CLAIM];

function evaluateThreats(room: Room, isMyOwnedRoom: boolean): RoomThreatInfo | undefined {
    let dangerousParts = isMyOwnedRoom ? DANGEROUS_PARTS_OWNED_ROOM : DANGEROUS_PARTS;

    let hostileTowers = !isMyOwnedRoom
        ? room
              .find(FIND_HOSTILE_STRUCTURES)
              .filter(s => s.structureType === STRUCTURE_TOWER)
              .map(t => t as StructureTower)
        : [];

    let allEnemies = room.find(FIND_HOSTILE_CREEPS);
    if (!allEnemies.length && !hostileTowers.length) {
        return undefined;
    }

    let allDangerous = allEnemies.filter(c => _.any(c.body, p => dangerousParts.includes(p.type)));
    let dangerousByPlayer: { [playerName: string]: Creep[] } = {};
    allDangerous.forEach(c => {
        if (!dangerousByPlayer[c.owner.username]) dangerousByPlayer[c.owner.username] = [];
        dangerousByPlayer[c.owner.username].push(c);
    });
    let threatsByPlayer: { [playerName: string]: ThreatInfo } = {};
    Object.keys(allDangerous).forEach(
        player => (threatsByPlayer[player] = sumThreat(dangerousByPlayer[player], hostileTowers, player))
    );

    return {
        lastUpdated: Game.time,
        numCombatants: allDangerous.length,
        numNonhostile: allEnemies.length - allDangerous.length,
        threatsByPlayer: threatsByPlayer
    };
}

function sumThreat(creeps: Creep[], allTowers: StructureTower[], owner: string): ThreatInfo {
    let totalAttack = 0;
    let totalRanged = 0;
    let totalHeal = 0;
    let totalTower = 0;

    creeps.forEach(c => {
        totalAttack += c.getBodyPower(ATTACK, "attack", ATTACK_POWER);
        totalHeal += c.getBodyPower(HEAL, "heal", HEAL_POWER);
        totalRanged += c.getBodyPower(RANGED_ATTACK, "rangedAttack", RANGED_ATTACK_POWER);
    });

    allTowers.forEach(t => {
        if (t.owner.username === owner) {
            totalTower += TOWER_POWER_ATTACK;
            totalHeal += TOWER_POWER_HEAL;
        }
    });

    return {
        towerDpt: totalTower,
        meleeDpt: totalAttack,
        rangedDpt: totalRanged,
        healPt: totalHeal
    };
}

function roomNameAt(room: Room, roomCoordMod: Coord) {
    let baseRoomCoord = new RoomPosition(0, 0, room.name).roomCoords;
    return roomNameFromCoord({ x: baseRoomCoord.x + roomCoordMod.x, y: baseRoomCoord.y + roomCoordMod.y });
}

function findRallyPoint(room: Room): RoomPosition | undefined {
    let matrix: CostMatrix = new PathFinder.CostMatrix();
    if (Traveler.roomType(room.name) === ROOMTYPE_CONTROLLER) {
        //Init cost matrix as 255 for everything
        for (let y = 0; y <= 49; y++) for (let x = 0; x <= 49; x++) matrix.set(x, y, 255);
        //Flood fill from the controller pos, setting open spaces to 0s.
        //Anything not connected to controller will stay as 255s (solid rock)
        matrix = floodFill(room, [room.controller!.pos.localCoords], false, matrix);
    } else {
        let terrain = Game.map.getRoomTerrain(room.name);
        for (let y = 0; y <= 49; y++) {
            for (let x = 0; x <= 49; x++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) matrix.set(x, y, 255);
                else matrix.set(x, y, 0);
            }
        }
        //Pack the cost matrix with terrain data, just 255 for walls and 0s for open spaces
    }

    //Use the distance transform to find open spots, passing the matrix from before
    matrix = distanceTransformDiag(matrix, false, room);
    //Find the max value in the resulting matrix, it is now the rally point! Tiebreak with favoring
    // distance to the center of the room
    let highest: number = 0;
    let highestCoord: Coord = { x: 0, y: 0 };
    for (let y = 0; y <= 49; y++) {
        for (let x = 0; x <= 49; x++) {
            if (matrix.get(x, y) > 0 && matrix.get(x, y) >= highest) {
                let currentDist = manhattanDistance(x, y, 25, 25);
                let highestDist = manhattanDistance(highestCoord.x, highestCoord.y, 25, 25);
                if (highest == -1 || currentDist < highestDist) {
                    highest = matrix.get(x, y);
                    highestCoord.x = x;
                    highestCoord.y = y;
                }
            }
        }
    }

    return highest > 0 ? new RoomPosition(highestCoord.x, highestCoord.y, room.name) : undefined;
}

function findPathableExits(rallyPos: RoomPosition, exitsToRoomNames: string[]): string[] {
    return exitsToRoomNames.filter(name => {
        let path = Traveler.findTravelPath(rallyPos, new RoomPosition(25, 25, name), {
            range: 23,
            maxRooms: 2,
            ignoreStructures: false
        });
        return path && !path.incomplete;
    });
}

function evaluatePathing(room: Room, exitsToRooms: string[]): RoomPathingInfo | undefined {
    let rallyPosition = findRallyPoint(room);
    if (rallyPosition) {
        return {
            packedRallyPos: packCoord(rallyPosition.localCoords),
            pathableExits: findPathableExits(rallyPosition, exitsToRooms)
        };
    }
    return undefined;
}

function evaluateRoomDepth(pathingInfo: RoomPathingInfo | undefined, exitsToRooms: string[], shardMap: ShardMap) {
    let depthCheckRooms = pathingInfo?.pathableExits.map(roomName => shardMap[roomName]).filter(data => data);
    if (!depthCheckRooms || depthCheckRooms.length === 0) {
        depthCheckRooms = exitsToRooms.map(roomName => shardMap[roomName]).filter(data => data);
    }
    return (_.min(depthCheckRooms, roomData => roomData.roomSearchDepth)?.roomSearchDepth ?? 99) + 1;
}

export function scoutRoom(room: Room, shardMap: ShardMap): RoomScoutingInfo {
    let ownership = evaluateOwnership(room);

    let exitsToRooms: string[] =
        _.unique(Object.values(Game.map.describeExits(room.name)))
            .filter(v => v)
            .map(v => v!) ?? [];
    let pathingInfo = evaluatePathing(room, exitsToRooms);
    let roomDepth =
        ownership?.username === global.PLAYER_USERNAME ? 0 : evaluateRoomDepth(pathingInfo, exitsToRooms, shardMap);

    return {
        roomName: room.name,
        roomType: Traveler.roomType(room.name),
        roomSearchDepth: roomDepth,
        miningInfo: evaluateMining(room),
        ownership: ownership,
        hazardInfo: evaluateThreats(room, ownership?.username === global.PLAYER_USERNAME),
        exitsToRooms: exitsToRooms,
        pathingInfo: pathingInfo
    };
}

export function assignRoomToScout(
    creep: Creep,
    cluster: string[],
    scoutedRooms: ShardMap,
    alreadyAssigned: string[],
    maxDepth: number
): string | undefined {
    let roomsToExplore = getRoomsToExplore(cluster, scoutedRooms, alreadyAssigned, maxDepth);

    if (roomsToExplore.length === 1) return roomsToExplore[0];
    else if (roomsToExplore.length > 1)
        return _.min(roomsToExplore, roomName => getMultirooomDistance(creep.pos, new RoomPosition(25, 25, roomName)));

    return undefined;
}

export function getRoomsToExplore(
    cluster: string[],
    scoutedRooms: ShardMap,
    alreadyAssigned: string[],
    maxDepth: number
): string[] {
    let minDepth = 999;
    let roomsToExplore: string[] = [];
    //Find rooms bordering explored rooms we can explore
    for (let roomName of cluster) {
        let scoutingInfo = scoutedRooms[roomName];
        //If the room is already far out, ignore it
        if (scoutingInfo.roomSearchDepth >= maxDepth) continue;

        //Find rooms it connects to that aren't explored AND arent assigned already
        let eligibleExits = (scoutingInfo.pathingInfo?.pathableExits ?? []).filter(
            roomName => !scoutedRooms[roomName] && !alreadyAssigned.includes(roomName)
        );

        if (eligibleExits.length) {
            //If there are rooms to explore, only add them to the list if they are among the closest to the cluster center
            if (scoutingInfo.roomSearchDepth < minDepth) {
                roomsToExplore = [...eligibleExits];
                minDepth = scoutingInfo.roomSearchDepth;
            } else if (scoutingInfo.roomSearchDepth === minDepth) {
                roomsToExplore.push(...eligibleExits);
            }
        }
    }
    return roomsToExplore;
}

const SCOUTED_SIGN = "👁️";
const EXCLUSION_SIGN = "⛔";
const RESERVED_SIGN = "🏴";
const OWNED_SIGN = "⚫";
const EXCLUSION_ZONE = 2;

//room position target locks with a TTL
let controllerTargetLocks: { [creepName: string]: [RoomPosition, number] | undefined } = {};
export function runScout(scout: Creep, roomToExplore: string, shardMap: ShardMap): boolean {
    //If the room we are in is on our map but isn't signed by us
    if (scout.pos.room?.controller && shardMap[scout.pos.roomName] && !controllerTargetLocks[scout.name]) {
        let signature = getAppropriateControllerSignature(shardMap[scout.pos.roomName]);
        if (scout.pos.room.controller.sign?.text !== signature) {
            controllerTargetLocks[scout.name] = [scout.pos.room.controller.pos, Game.time + 200];
            scout.queueSay("🎯" + signature);
        }
    }

    let positionLock = controllerTargetLocks[scout.name];
    let done = false;

    //Clear the lock after TTL is up. For saftey...
    if (positionLock && positionLock[1] < Game.time) {
        delete controllerTargetLocks[scout.name];
        positionLock = undefined;
        scout.queueSay("🎯🤔");
    }

    //Sign the controller if we locked onto it ans are near
    if (positionLock && scout.pos.isNearTo(positionLock[0].x, positionLock[0].y)) {
        scout.queueSay("🖊️✅");
        scout.signController(scout.room.controller!, getAppropriateControllerSignature(shardMap[scout.pos.roomName]));
        delete controllerTargetLocks[scout.name];
    }
    //Head to the targeted controller
    else if (positionLock) {
        scout.queueSay("🖊️🎯");
        Traveler.travelTo(scout, positionLock[0]);
    }
    //If we are in the room we need to explore
    else if (scout.pos.roomName === roomToExplore && !shardMap[roomToExplore]) {
        let roomData = scoutRoom(scout.room, shardMap);
        //If it is a controller room, work on signing the controller if it isn't already done
        scout.queueSay("👁️✅");
        done = true;
        shardMap[roomToExplore] = roomData;
    }
    //We aren't in the room yet. Go to it
    else if (scout.pos.roomName !== roomToExplore && !shardMap[roomToExplore]) {
        Traveler.travelTo(scout, new RoomPosition(25, 25, roomToExplore), { range: 23 });
        scout.queueSay("👁️");
    }
    //It was scouted before we could get there. Done!
    else if (shardMap[roomToExplore]) {
        done = true;
        scout.queueSay("👁️✅");
    }

    return done;
}

function getAppropriateControllerSignature(roomData: RoomScoutingInfo): string {
    if (!roomData) return "❓";

    const room = Game.rooms[roomData.roomName];
    if (room) {
        if (!room.controller) return "❓";
        if (room.controller?.owner?.username === global.PLAYER_USERNAME) {
            return OWNED_SIGN;
        }
        if (room.controller?.reservation?.username === global.PLAYER_USERNAME) {
            return RESERVED_SIGN;
        }
    }

    if (roomData.roomSearchDepth <= EXCLUSION_ZONE && !room.controller?.owner && !room.controller?.reservation)
        return EXCLUSION_SIGN;

    return SCOUTED_SIGN;
}
