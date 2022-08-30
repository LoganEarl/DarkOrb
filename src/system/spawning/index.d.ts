interface CreepConfig {
    body: BodyPartConstant[];
    handle: string; //Id used to look up the creeps
    jobName: string; //The name of the creep's job. Used in prioritization and is added to name
    quantity: number; //How many of this creep to maintain. Note, this does not garuntee only one creep will be alive at a time
    //To do that, disable all prespawning as well

    dontPrespawnParts?: boolean; //Prevents prespawning the creep based on body size
    additionalPrespawntime?: number; //If present, adds additional prespawn time. Independent from body-based prespawn times
    spawnPosition?: SpawnPosition; //Instruction to use a specific spawn with a specific spawn direction
    desiredRoomPosition?: RoomPosition; //If present will be used to select a spawn when multiple are possible

    memory?: CreepMemory; //Memory to give the new creep
    boosts?: BoostDefinition[]; //What boosts to give the creep
}

interface SpawnPosition {
    spawnId: Id<StructureSpawn>;
    directions: DirectionConstant[];
}

interface BoostDefinition {
    bodyPart: BodyPartConstant;
    boostType: ResourceConstant;
    numNeeded: number;
    optional?: boolean;
}

interface ManifestMemory {
    previousNameIndex: number;
    creepNamesByHandle: { [handle: string]: string[] };
}

interface Memory {
    manifestMemory?: ManifestMemory;
}
