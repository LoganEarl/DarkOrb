/*
    Overview of the work system

    There are types of work that can be done. If a given type of work needs attention, a work detail is 
    created for the work type. Targets are registered to that work detail. A portion of the worker pool
    will be dispatched to accomplish the work when convinient. 

    There are multiple pools of workers, deliniated by their body composition. Each work detail specifies
    which pools of workers have access to the work. 

    Work details are prioritized within their worker pools. Idle workers will be assigned to the detail
    with the highest priority. 

    When posting a work detail, it is preffered if the detail's target progress can be reasonably 
    reached within a few hundred ticks. This keeps workers from getting stuck on a single job for too
    long.

    Work targets each have their own sub-priority. This is used when individual workers are choosing 
    a target. If none is provided workers will choose whichever is the closest for roads and walls,
    and choose from a preset build priority list for buildings and upgrde jobs

*/
type DetailType =
    | "Upgrade" //Standard type for upgrading room RCL
    | "Construction" //Build buildings
    | "Reinforce" //Build ramparts/walls higher. Used when all ramparts are around the same hits
    | "Repair" //Repair buildings in the room
    | "RampartRepair"; //Repair ramparts that are very low and rampars that are significantly lower than their neighboors

type WorkerPool = "Workers" | "Upgraders" | "EmergencyRepairers";

type WorkDetailPriority =
//Normal tasks. Creeps won't cross pool boundaries for these unless they have nothing else in their own pool.
//Examples include building a road and upgrading a controller that has plenty left on the downgrade timer
    | "Normal"
    //These tasks appear in all applicable pools. They are higher priority than any "Normal" ones. The "primary pool"
    //  attribute of creeps does not apply for these
    | "Elevated"
    //These are seen by every creep regardless of pool and will be worked on by anyone that can.
    | "Critical";

interface WorkTarget {
    packedPosition: string;
    currentProgress: number;
    targetProgress: number;
    targetId: Id<Structure | ConstructionSite | StructureController>;
    targetType: StructureConstant;
}

interface WorkDetail {
    parentRoom: string;
    detailId: string;
    priority: WorkDetailPriority;
    detailType: DetailType;
    //The main worker subtype responsible for this job
    primaryPool: WorkerPool;
    //All worker subtypes that can work on these jobs
    workerPools: WorkerPool[];
    //How many work parts before this is considered satisfied
    maxWorkParts: number;
    //The max number of creeps that can work on this
    maxCreeps: number;

    //Maps the target id as a string to the work target
    targets: { [targetId: string]: WorkTarget };
}

type WorkDetailMemory = { [parentRoomName: string]: { [detailId: string]: WorkDetail } };

interface Memory {
    workDetails?: WorkDetailMemory;
}
