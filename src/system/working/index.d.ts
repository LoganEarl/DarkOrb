type DetailType =
    | "Upgrade" //Standard type for upgrading room RCL
    | "Construction" //Build buildings
    | "Reinforce" //Build ramparts/walls higher. Used when all ramparts are around the same hits
    | "Repair" //Repair buildings in the room
    | "RampartRepair"; //Repair ramparts that are very low and rampars that are significantly lower than their neighboors

interface WorkDetail {
    //Id used for deduplication
    detailId: string;

    roomName: string;

    detailType: DetailType;

    currentProgress?: number;
    targetProgress?: number;

    //If construction sites, will be completed accoring to the greatest completion, then sort order
    //If buildings for repair, will be completed based on completion percentage for non-wall/ramps and bucketed min hits for wall/ramps
    targetId: Id<Structure | ConstructionSite | StructureController>;
    //Set for construction work and repair work. Used to establish priorities between details
    targetStructureType?: StructureConstant;
}

type WorkDetailMemory = { [roomName: string]: { [id: string]: WorkDetail } };

interface Memory {
    workDetails?: WorkDetailMemory;
}
