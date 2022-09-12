import { PriorityQueueItem } from "utils/PriorityQueue";

declare global {
    type LogisticsNodeType = "Source" | "Sink"; //Source means we are sourcing energy. I.e. take the energy away from here. Sink means we want energy and are spending it
    type LogisticsNodeTarget =
        | Creep
        | AnyStoreStructure
        | Tombstone
        | Resource
        | Ruin
        | ScoreContainer
        | SymbolContainer
        | ScoreCollector
        | SymbolDecoder;

    interface LogisticsNode {
        nodeId: string; //Unique identifier of the node.
        targetId: string; //Unique identifier. Will be the target of the node. (i.e. a creep name, building id, tombstone id, etc)
        level: number; //How much we have currently have. This is only current for the tick that assign job triggered
        maxLevel: number; //The maximum the node can hold. Relevant for remote mining container's limited capacity
        resource: string; //The Type of resource
        type: LogisticsNodeType; //Whether we want delivered or we want it gone
        analyticsCategories: string[]; //What categories we record the analytics data for
        priorityScalar?: number; //A scalar value to multiply the drdt calculation with to incentivize some transfers over others
        baseDrdt: number; //How quickly the resource level changes over time. Beware, can be +/-. Used in conjunction with service route to determine number of carry parts
        bodyDrdt?: number; //How much resource should be moved per tick. Replaces baseDrdt for the purposes of creep quotas.
        //Use for temporary jobs that are low priority such as scoreing and looting
        serviceRoute: {
            //The path info for going from this request to the main storage
            pathLength: number;
            pathCost: number;
        };
        lastKnownPosition: RoomPosition; //Where the node is. This location should only be used if finding the game object by it's id fails.
    }

    interface LogisticsPairing extends PriorityQueueItem {
        haulerName: string;
        nodeId: string;
        eta: number; //keep sorted by this value
        deltaAtETA: number; //The amount the creep is capable of modifing the node level at the eta. (positive or negative)
        drdt: number; //Pretty much just the deltaAtETA / eta. Source request invert this value, so higher drdts always correspond to more resource movement
        usesServiceRoute: boolean; //whether or not creep should make a pit stop at the storage to sort out its store
    }

    interface LogisticsNodeProvidor {
        provideLogisticsNodes(): LogisticsNode[];
    }

    interface HaulerRunResults {
        newUsedCapacity: number; //The amount creep capacity used by all resources the creep has
        newFreeCapacity: number; //The amount of free space the creep has for any resource
        usedMove: boolean; //Whether we have already moved this tick
        usedTransfer: boolean; //Whether we have transfered resources this tick
        usedPickup: boolean; //Whether we have picked up resources this tick
        done: boolean; //Whether we completed the job this tick
        invalidNode: boolean; //Flag set when the node it tried to service was invalid in some way and should be deleted
    }
}
