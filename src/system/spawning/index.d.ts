type BodySorter = (a: BodyPartConstant, b: BodyPartConstant) => number;

interface SpawnRoom {
    roomName: string;
    tickCapacity: number; //Ticks of spawn time per 1500 ticks. (can be greater with powers or additional spawns)
    energyCapacity: number;
}

interface CreepConfig {
    body: BodyPartConstant[];
    handle: string; //Id used to look up the creeps
    subHandle?: string; //Need this when we have multiple configs defined under the same handle. This is what the spawning engine uses to tell them apart
    jobName: string; //The name of the creep's job. Used in prioritization and is added to name
    quantity: number; //How many of this creep to maintain. Note, this does not garuntee only one creep will be alive at a time
    //To do that, disable all prespawning as well

    dontPrespawnParts?: boolean; //Prevents prespawning the creep based on body size
    additionalPrespawntime?: number; //If present, adds additional prespawn time. Independent from body-based prespawn times
    spawnPosition?: SpawnPosition; //Instruction to use a specific spawn with a specific spawn direction
    //TODO implement
    desiredRoomPosition?: RoomPosition; //If present will be used to select a spawn when multiple are possible
    subPriority?: number; //Number used to break ties when the priorities of two jobs overlap.

    memory?: CreepMemory; //Memory to give the new creep
    boosts?: BoostDefinition[]; //What boosts to give the creep
}

interface CreepMemory {
    handle: string;
    subHandle?: string;
    jobName: string;
    boosts?: BoostDefinition[];
}

interface SpawnPosition {
    spawnName: string;
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
    creepNamesByHandle: { [handle: string]: { [subHandle: string]: string[] } };
}

interface Memory {
    manifestMemory?: ManifestMemory;
}
