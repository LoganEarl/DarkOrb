type WorkFocus =
    | "None" //Spend as little as possible to build up a reserve
    | "Upgrade" //Focus on increasing RCL. Will devote only 1 creep to building/maintenence
    | "Construction"; //Focus on building new buildings. Workers will mostly build cosntruction sites
// | "Expansion"; //Focus most creeps on buildings in other rooms.

type DetailType =
    | "Upgrade" //Standard type for upgrading room RCL
    | "Construction" //Build buildings
    | "Reinforce" //Build ramparts/walls higher.
    | "Repair"; //Repair buildings in the room. Used to repair low ramparts too

interface WorkDetail {
    //Id used for deduplication
    detailId: string;

    destPosition: RoomPosition;

    detailType: DetailType;

    //Required for repair or reinforce jobs
    currentProgress?: number;
    targetProgress?: number;

    //If construction sites, will be completed accoring to the greatest completion, then sort order
    //If buildings for repair, will be completed based on completion percentage for non-wall/ramps and bucketed min hits for wall/ramps
    targetId: Id<Structure | ConstructionSite | StructureController>;
    //Set for construction work and repair work. Used to establish priorities between details
    targetStructureType?: StructureConstant;
}

interface WorkMemory {
    details: { [id: string]: WorkDetail };
    focus: WorkFocus;
    lastFocusUpdate: number;
}

interface Memory {
    workMemory?: { [roomName: string]: WorkMemory };
}
