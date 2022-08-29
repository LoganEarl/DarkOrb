import { RoomScoutingInfo } from "./ScoutInterface";

type ShardMap = { [roomName: string]: RoomScoutingInfo };

interface ScoutMemory {
    myRoomNames: string[];
    shardMap: ShardMap;
    //array of clusters, each cluster is a string[] of room names in the cluster
    clusters: string[][];
}

declare global {
    interface Memory {
        scoutMemory?: ScoutMemory;
    }
}
