type RoomType = 0 | 1 | 2 | 3;

type RoomOwnershipType =
    | "Claimed" //They own the controller
    | "Reserved"; //They reserved the controller

interface SourceInfo {
    packedId: string;
    packedPosition: string;
    packedFreeSpots: string;
}

interface MineralInfo {
    packedId: string;
    packedPosition: string;
    packedFreeSpots: string;
    mineralType: MineralConstant;
}

interface RoomMiningInfo {
    sources: [SourceInfo, ...SourceInfo[]]; //At least 1 source
    mineral: MineralInfo;
}

interface RoomOwnershipInfo {
    lastUpdated: number;
    username: string;
    rcl: number;
    ownershipType: RoomOwnershipType;
}

interface ThreatInfo {
    towerDpt: number;
    meleeDpt: number;
    rangedDpt: number;
    healPt: number;
}

interface RoomThreatInfo {
    lastUpdated: number;
    threatsByPlayer: { [playerName: string]: ThreatInfo };
    numCombatants: number; //How many enemies that can hurt us
    numNonhostile: number; //How many enemies without hurty/worky/claimy parts
}

interface RoomPathingInfo {
    //(if present. If not present it is just the largest open area)
    pathableExits: string[]; //Exits reachable from the rally position
    packedRallyPos: string; //The position of the largest open area reachable from the controller
}

interface RoomScoutingInfo {
    roomName: string;
    roomType: RoomType;
    roomSearchDepth: number; //How many rooms away this is from one of our claimed rooms
    exitsToRooms: string[];

    pathingInfo?: RoomPathingInfo; //If present, indicates this is an open enough room that we can rally creeps there.
    hazardInfo?: RoomThreatInfo; //Any invaders or hostile players displayed here
    miningInfo?: RoomMiningInfo; //Mining information on the room. Only present for Standard, Core, and Keeper rooms types
    ownership?: RoomOwnershipInfo; //Who owns the room.
}

type ShardMap = { [roomName: string]: RoomScoutingInfo };

interface ScoutMemory {
    myRoomNames: string[];
    shardMap: ShardMap;
    //array of clusters, each cluster is a string[] of room names in the cluster
    clusters: string[][];
}
interface Memory {
    scoutMemory?: ScoutMemory;
}
