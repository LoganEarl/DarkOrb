type RoomType = 0 | 1 | 2 | 3;

type RoomOwnershipType =
    | "Claimed" //They own the controller. Superceeds other forms
    | "Reserved" //They reserved the controller. Superceeds military and economic
    | "Military" //They have combat creeps present. Superceeds economic
    | "Economic"; //They have economic creeps present. Likely remotes.

interface SourceInfo {
    id: string;
    packedPosition: string;
    packedFreeSpots: string;
}

interface MineralInfo {
    id: string;
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
    playerName: string;
    towerDpt: number;
    meleeDpt: number;
    rangedDpt: number;
    healPt: number;
}

type RoomTerritoryInfo = [TerritoryInfo, ...TerritoryInfo[]];
interface TerritoryInfo {
    roomName: string;
    range: number;
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
    exitsToRooms: string[];
    territoryInfo: RoomTerritoryInfo; //Which of my rooms are near to this one. Needs to be at least one

    // territoryInfo?:RoomTerritoryInfo[]; //Whi
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
