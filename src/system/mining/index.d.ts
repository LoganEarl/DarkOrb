type MinerState =
    | "Active" //Business as usual
    | "New" //Waiting to be given a state. Considered stopped but without a reason
    | "Stopped"; //Not able to mine. Refer to the stop reasons array
type MinerStopReason =
    | "PathBlocked" //We can't get to the mining site
    | "NoMapData" //We are missing scouting data for the room
    // | "Attacked" //The mining site is dangerous
    // | "ForeignOwnership" //Somebody else claimed the room
    // | "ForeignReservation" //Somebody else reserved the site
    | "NoHomeRoom" //Home room is missing. Mining system should be destroyed with time
    | "Mandated"; //We were told to stop

interface MinerAssignment {
    creepName: string;
    placeToStand: RoomPosition;
    mineId: Id<Source | Mineral>;
    depositContainer?: Id<StructureContainer>;
    depositLink?: Id<StructureLink>;
    constructionProject?: Id<ConstructionSite>;
}
interface SourceMinerMemory {
    state: MinerState;
    stopReasons: MinerStopReason[];
    //How many squares away the source is
    pathLength: number;
    //How much fatigue gets generated over that trip per part
    pathCost: number;
}

interface Memory {
    sourceMinerMemory: { [sourceId: string]: SourceMinerMemory };
}
