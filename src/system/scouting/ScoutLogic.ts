import { object } from "lodash";
import { planRoom } from "system/planning/PlannerInterface";
import { distanceTransformDiag } from "utils/algorithms/DistanceTransform";
import { floodFill } from "utils/algorithms/FloodFill";
import { Log } from "utils/logger/Logger";
import { packCoord, packCoordList, unpackCoord, packPos, packPosList } from "utils/Packrat";
import { ROOMTYPE_CONTROLLER, Traveler } from "utils/traveler/Traveler";
import {
    getFreeSpacesNextTo,
    getMultirooomDistance,
    manhattanDistance,
    roomNameFromCoord
} from "utils/UtilityFunctions";

const MINING_DATA_MIN_TTL = 100;
const MINING_DATA_MAX_TTL = 5000;

const OWNERSHIP_DATA_MIN_TTL = 1500;
const OWNERSHIP_DATA_MAX_TTL = 5000;

const THREAT_DATA_MIN_TTL = 3;
const THREAT_DATA_MAX_TTL = 5000;

const TERRITORY_DATA_MIN_TTL = 1500;
const TERRITORY_DATA_MAX_TTL = 5000;

const PATH_DATA_MIN_TTL = 500;
const PATH_DATA_MAX_TTL = 5000;

const SCOUTED_SIGN = "👁️";
const EXCLUSION_SIGN = "⛔";
const RESERVED_SIGN = "🏴";
const OWNED_SIGN = "⚫";
const EXCLUSION_ZONE = 2;

function evaluateSources(sources: [Source, ...Source[]]): [SourceInfo, ...SourceInfo[]] {
    if (sources.length == 1) {
        return [
            {
                id: sources[0].id,
                packedPosition: packPos(sources[0].pos),
                packedFreeSpots: packPosList(getFreeSpacesNextTo(sources[0].pos, sources[0].room))
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
            id: s.id as string,
            packedPosition: packPos(s.pos),
            packedFreeSpots: ""
        };
    }) as [SourceInfo, ...SourceInfo[]];

    // Log.d("Free spaces by source:" + JSON.stringify(freeSpacesBySource));

    //Add free spaces one at a time to each source. This solves for cases where they have overlaping spots
    let packedUsedSpots: string[] = [];
    let maxFreeSpaces = _.max(freeSpacesBySource, spaces => spaces.length)?.length ?? 0;
    for (let spaceIndex = 0; spaceIndex < maxFreeSpaces; spaceIndex++) {
        // Log.d(`looping for free space index ${spaceIndex} of ${maxFreeSpaces}`);
        for (let sourceIndex = 0; sourceIndex < freeSpacesBySource.length; sourceIndex++) {
            let freeSpaces = freeSpacesBySource[sourceIndex];
            // Log.d(`Checking source ${sourceIndex}. Found free ${freeSpaces.length} spaces around it`);
            if (spaceIndex < freeSpaces.length) {
                let packedSpace = packPos(freeSpaces[spaceIndex]);
                if (!packedUsedSpots.includes(packedSpace)) {
                    packedUsedSpots.push(packedSpace);
                    sourceInfos[sourceIndex].packedFreeSpots += packedSpace;
                    // Log.d(`Space was not used. Adding ${packedSpace} to source ${sourceIndex}`);
                }
            }
        }
    }

    return sourceInfos;
}

function evaluateMineral(mineral: Mineral): MineralInfo {
    return {
        id: mineral.id as string,
        packedPosition: packPos(mineral.pos),
        packedFreeSpots: packPosList(getFreeSpacesNextTo(mineral.pos, mineral.room)),
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
        mineral: evaluateMineral(mineral[0]),
        lastUpdate: Game.time,
        minNextUpdate: Game.time + MINING_DATA_MIN_TTL,
        maxNextUpdate: Game.time + MINING_DATA_MAX_TTL
    };
}

const DANGEROUS_PARTS: BodyPartConstant[] = [RANGED_ATTACK, ATTACK, HEAL];
const DANGEROUS_PARTS_OWNED_ROOM: BodyPartConstant[] = [RANGED_ATTACK, ATTACK, HEAL, WORK, CLAIM];

function evaluateOwnership(room: Room): [RoomThreatInfo | undefined, RoomOwnershipInfo | undefined] {
    let ownershipInfo: RoomOwnershipInfo | undefined;
    let threatInfo: RoomThreatInfo | undefined;

    //Try to determine ownership with reservation or the controller
    if (room.controller?.owner || room.controller?.reservation) {
        let ownerName = room.controller.owner?.username ?? room.controller.reservation!.username;
        ownershipInfo = {
            username: ownerName,
            rcl: room.controller.level,
            ownershipType: room.controller.owner ? "Claimed" : "Reserved",
            lastUpdate: Game.time,
            minNextUpdate: Game.time + OWNERSHIP_DATA_MIN_TTL,
            maxNextUpdate: Game.time + OWNERSHIP_DATA_MAX_TTL
        };
    } else if (room.controller && !room.controller.owner) {
        ownershipInfo = {
            ownershipType: "Unclaimed",
            lastUpdate: Game.time,
            minNextUpdate: Game.time + OWNERSHIP_DATA_MIN_TTL,
            maxNextUpdate: Game.time + OWNERSHIP_DATA_MAX_TTL
        };
    }

    let isMyOwnedRoom = ownershipInfo?.username === global.PLAYER_USERNAME;

    let dangerousParts = isMyOwnedRoom ? DANGEROUS_PARTS_OWNED_ROOM : DANGEROUS_PARTS;

    let hostileTowers = !isMyOwnedRoom
        ? room
              .find(FIND_HOSTILE_STRUCTURES)
              .filter(s => s.structureType === STRUCTURE_TOWER)
              .map(t => t as StructureTower)
        : [];

    let allEnemies = room.find(FIND_HOSTILE_CREEPS);
    if (allEnemies.length || hostileTowers.length) {
        let allDangerous = allEnemies.filter(c => !c.my && _.any(c.body, p => dangerousParts.includes(p.type)));
        let dangerousByPlayer: { [playerName: string]: Creep[] } = {};
        allDangerous.forEach(c => {
            if (!dangerousByPlayer[c.owner.username]) dangerousByPlayer[c.owner.username] = [];
            dangerousByPlayer[c.owner.username].push(c);
        });
        let threatsByPlayer: { [playerName: string]: ThreatInfo } = {};
        Object.keys(allDangerous).forEach(
            player => (threatsByPlayer[player] = sumThreat(dangerousByPlayer[player] ?? [], hostileTowers, player))
        );

        let allPeaceful = allEnemies.filter(c => !c.my && !_.any(c.body, p => dangerousParts.includes(p.type)));
        let peacefullByPlayer: { [playerName: string]: number } = {};
        allPeaceful.forEach(
            creep => (peacefullByPlayer[creep.owner.username] = (peacefullByPlayer[creep.owner.username] ?? 0) + 1)
        );

        threatInfo = {
            numCombatants: allDangerous.length,
            numNonhostile: allPeaceful.length,
            threatsByPlayer: threatsByPlayer,
            lastUpdate: Game.time,
            minNextUpdate: Game.time + THREAT_DATA_MIN_TTL,
            maxNextUpdate: Game.time + THREAT_DATA_MAX_TTL
        };

        //If we didn't get ownership info from reservation info, use the creep info instead
        if (!ownershipInfo) {
            let maxThreat = _.max(
                Object.values(threatsByPlayer),
                t => t.towerDpt + t.healPt + t.meleeDpt + t.rangedDpt
            );
            let maxPeaceful = _.max(Object.keys(peacefullByPlayer), p => peacefullByPlayer[p]);

            let owner = maxThreat?.playerName ?? maxPeaceful;
            let type: RoomOwnershipType = maxThreat ? "Military" : "Economic";

            ownershipInfo = {
                username: owner,
                rcl: 0,
                ownershipType: type,
                lastUpdate: Game.time,
                minNextUpdate: Game.time + OWNERSHIP_DATA_MIN_TTL,
                maxNextUpdate: Game.time + OWNERSHIP_DATA_MAX_TTL
            };
        }
    } else {
        threatInfo = {
            numCombatants: 0,
            numNonhostile: 0,
            threatsByPlayer: {},
            lastUpdate: Game.time,
            minNextUpdate: Game.time + THREAT_DATA_MIN_TTL,
            maxNextUpdate: Game.time + THREAT_DATA_MAX_TTL
        };
    }

    // Log.d(JSON.stringify([threatInfo, ownershipInfo]));

    return [threatInfo, ownershipInfo];
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
        playerName: owner,
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
        matrix = floodFill(room.name, [room.controller!.pos.localCoords], undefined, matrix);
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
    matrix = distanceTransformDiag(matrix, undefined, 0, 0, 49, 49, true);
    //Find the max value in the resulting matrix, it is now the rally point! Tiebreak with favoring
    // distance to the center of the room
    let highest: number = -1;
    let highestCoord: Coord = { x: 0, y: 0 };
    for (let y = 0; y <= 49; y++) {
        for (let x = 0; x <= 49; x++) {
            if (matrix.get(x, y) > 0 && matrix.get(x, y) >= highest) {
                if (matrix.get(x, y) === highest) {
                    let currentDist = manhattanDistance(x, y, 25, 25);
                    let highestDist = manhattanDistance(highestCoord.x, highestCoord.y, 25, 25);
                    if (highest == -1 || currentDist < highestDist) {
                        highest = matrix.get(x, y);
                        highestCoord.x = x;
                        highestCoord.y = y;
                    }
                } else {
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
        let allowedRooms: { [roomName: string]: boolean } = {};
        allowedRooms[rallyPos.roomName] = true;
        allowedRooms[name] = true;
        let path = Traveler.findTravelPath(rallyPos, new RoomPosition(25, 25, name), {
            range: 21,
            route: allowedRooms,
            ignoreStructures: false,
            offRoad: true
        });
        return path && !path.incomplete;
    });
}

function evaluatePathing(room: Room, exitsToRooms: string[]): RoomPathingInfo | undefined {
    let rallyPosition = findRallyPoint(room);
    if (rallyPosition) {
        return {
            packedRallyPos: packPos(rallyPosition),
            pathableExits: findPathableExits(rallyPosition, exitsToRooms),
            lastUpdate: Game.time,
            minNextUpdate: Game.time + PATH_DATA_MIN_TTL,
            maxNextUpdate: Game.time + PATH_DATA_MAX_TTL
        };
    }
    return undefined;
}

function evaluateRoomDepth(
    searchRoomName: string,
    pathingInfo: RoomPathingInfo | undefined,
    exitsToRooms: string[],
    shardMap: ShardMap,
    territoryRange: number,
    ownership: RoomOwnershipInfo | undefined
): RoomTerritoryInfo {
    if (ownership?.username === global.PLAYER_USERNAME && ownership?.ownershipType === "Claimed") {
        return {
            claims: [{ roomName: searchRoomName, range: 0 }],
            lastUpdate: Game.time,
            minNextUpdate: Game.time + TERRITORY_DATA_MIN_TTL,
            maxNextUpdate: Game.time + TERRITORY_DATA_MAX_TTL
        };
    }

    let nearbyRooms = pathingInfo?.pathableExits.map(roomName => shardMap[roomName]).filter(data => data);
    if (!nearbyRooms || nearbyRooms.length === 0) {
        nearbyRooms = exitsToRooms.map(roomName => shardMap[roomName]).filter(data => data);
    }

    let territories: { [roomName: string]: TerritoryInfo } = {};
    for (let roomData of nearbyRooms) {
        if (roomData.territoryInfo) {
            for (let territory of roomData.territoryInfo.claims) {
                let existing = territories[territory.roomName];
                if (!existing || existing.range > territory.range + 1) {
                    territories[territory.roomName] = Object.assign({}, territory);
                    territories[territory.roomName].range = territories[territory.roomName].range + 1;
                }
            }
        }
    }

    let sortedTerritories: TerritoryInfo[] = Object.values(territories).filter(t => t.range <= territoryRange);
    sortedTerritories.sort((a, b) => a.range - b.range);

    let territoryInfo: RoomTerritoryInfo = {
        claims: sortedTerritories as [TerritoryInfo, ...TerritoryInfo[]],
        lastUpdate: Game.time,
        minNextUpdate: Game.time + TERRITORY_DATA_MIN_TTL,
        maxNextUpdate: Game.time + TERRITORY_DATA_MAX_TTL
    };

    return territoryInfo;
}

export function _scoutRoom(
    room: Room,
    shardMap: ShardMap,
    territoryRange: number,
    oldRoomData?: RoomScoutingInfo
): RoomScoutingInfo {
    let threatInfo = getIfCurrent(oldRoomData?.hazardInfo);
    let ownership = getIfCurrent(oldRoomData?.ownership);

    // Log.i("Threat: " + JSON.stringify(threatInfo));

    if (!threatInfo || !ownership) {
        let ownershipValues = evaluateOwnership(room);

        threatInfo = ownershipValues[0];
        ownership = ownershipValues[1];
    }

    let exitsToRooms: string[] =
        oldRoomData?.exitsToRooms ??
        _.unique(Object.values(Game.map.describeExits(room.name)))
            .filter(v => v)
            .map(v => v!) ??
        [];
    let pathingInfo = getIfCurrent(oldRoomData?.pathingInfo) ?? evaluatePathing(room, exitsToRooms);
    // Log.i(`ownership: ${JSON.stringify(ownership)} username: ${global.PLAYER_USERNAME}`);
    let territoryInfo =
        getIfCurrent(oldRoomData?.territoryInfo) ??
        evaluateRoomDepth(room.name, pathingInfo, exitsToRooms, shardMap, territoryRange, ownership);

    let result: RoomScoutingInfo = {
        roomName: room.name,
        roomType: Traveler.roomType(room.name),
        miningInfo: evaluateMining(room),
        territoryInfo: territoryInfo,
        ownership: ownership,
        hazardInfo: threatInfo,
        exitsToRooms: exitsToRooms,
        pathingInfo: pathingInfo,
        roomPlan: oldRoomData?.roomPlan
    };

    if (!shardMap[room.name]?.roomPlan && room.controller) {
        planRoom(room, result);
    }

    return result;
}

function getIfCurrent<T extends TTLData>(data: T | undefined): T | undefined {
    if (!data) return undefined;
    if (isPastMinTTL(data)) return data;
    return undefined;
}

function isPastMaxTTL(data: TTLData | undefined): boolean {
    if (!data) return true;
    return data.maxNextUpdate < Game.time;
}

function isPastMinTTL(data: TTLData | undefined): boolean {
    if (!data) return true;
    return data.minNextUpdate < Game.time;
}

export function _canBeUpdated(data: RoomScoutingInfo): boolean {
    return (
        isPastMinTTL(data.pathingInfo) ||
        isPastMinTTL(data.hazardInfo) ||
        isPastMinTTL(data.miningInfo) ||
        (data.roomType === ROOMTYPE_CONTROLLER && isPastMinTTL(data.ownership))
    );
}

function shouldSendScout(roomName: string, data: RoomScoutingInfo, alreadyAssigned: string[]): boolean {
    if (!data) return true;
    if (alreadyAssigned.includes(roomName)) return false;
    let outdatedPathing = isPastMaxTTL(data.pathingInfo);
    let outdatedHazard = isPastMaxTTL(data.hazardInfo);
    let outdatadMining = data.miningInfo && isPastMaxTTL(data.miningInfo);
    let outdatedOwnership = data.roomType === ROOMTYPE_CONTROLLER && isPastMaxTTL(data.ownership);

    let outdated = outdatedPathing || outdatedHazard || outdatadMining || outdatedOwnership;

    // Log.d(
    //     `Checking if room ${roomName} needs to get scouted. outdatedPathing:${outdatedPathing} outdatedHazard:${outdatedHazard} outdatadMining:${outdatadMining} outdatadMining:${outdatadMining}`
    // );
    return outdated;
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
        if (scoutingInfo.territoryInfo.claims[0].range >= maxDepth) continue;

        //Find rooms it connects to that aren't explored AND arent assigned already
        let eligibleExits = (scoutingInfo.pathingInfo?.pathableExits ?? []).filter(roomName =>
            shouldSendScout(roomName, scoutedRooms[roomName], alreadyAssigned)
        );

        if (eligibleExits.length) {
            //If there are rooms to explore, only add them to the list if they are among the closest to the cluster center
            if (scoutingInfo.territoryInfo.claims[0].range < minDepth) {
                roomsToExplore = eligibleExits.slice();
                minDepth = scoutingInfo.territoryInfo.claims[0].range;
            } else if (scoutingInfo.territoryInfo.claims[0].range === minDepth) {
                roomsToExplore.push(...eligibleExits);
            }
        }
    }

    // Log.d(`Rooms to explore ${JSON.stringify(roomsToExplore)}`);
    return roomsToExplore;
}

//room position target locks with a TTL
let controllerTargetLocks: { [creepName: string]: [RoomPosition, number] | undefined } = {};
export function runScout(scout: Creep, roomToExplore: string, shardMap: ShardMap, maxTerritoryRange: number): boolean {
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
        Traveler.travelTo(scout, positionLock[0], { offRoad: true });
    }
    //If we are in the room we need to explore
    else if (scout.pos.roomName === roomToExplore && !shardMap[roomToExplore]) {
        let roomData = _scoutRoom(scout.room, shardMap, maxTerritoryRange);
        //If it is a controller room, work on signing the controller if it isn't already done
        scout.queueSay("👁️✅");
        done = true;
        shardMap[roomToExplore] = roomData;
    }
    //We aren't in the room yet. Go to it
    else if (scout.pos.roomName !== roomToExplore && !shardMap[roomToExplore]) {
        Traveler.travelTo(scout, new RoomPosition(25, 25, roomToExplore), {
            range: 21,
            offRoad: true,
            useFindRoute: true
        });
        scout.queueSay("👁️");
    }
    //It was scouted before we could get there. Done!
    else if (!shouldSendScout(roomToExplore, shardMap[roomToExplore], [])) {
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

    if (
        roomData.territoryInfo.claims[0].range <= EXCLUSION_ZONE &&
        !room.controller?.owner &&
        !room.controller?.reservation
    )
        return EXCLUSION_SIGN;

    return SCOUTED_SIGN;
}
