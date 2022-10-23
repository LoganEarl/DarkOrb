import { spawn } from "child_process";
import { fill } from "lodash";
import { FEATURE_VISUALIZE_FAST_FILLER } from "utils/featureToggles/FeatureToggleConstants";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { Log } from "utils/logger/Logger";
import { Traveler } from "utils/traveler/Traveler";
import { roomPos } from "utils/UtilityFunctions";

export interface FillerPosition {
    standingPosition: RoomPosition;
    spawnId?: string;
    linkId?: string;
    direction?: DirectionConstant;
    containerId: string;
    extensionIds: string[];
}

export type FillRecords = { [id: string]: FillRecord };
//Used to rememeber which
interface FillRecord {
    structure?: AnyStoreStructure;
    newCapacity: number;
    maxCapacity: number;
}

export function runFillersForPosition(fillers: Creep[], position: FillerPosition, fillRecords: FillRecords) {
    let youngestFiller: Creep | undefined;
    if (fillers.length == 1) youngestFiller = fillers[0];
    else youngestFiller = _.min(fillers, creep => creep.ticksToLive);

    for (let filler of fillers) {
        //If this is the main filler
        if (filler.name === youngestFiller.name) {
            if (!filler.pos.isEqualTo(position.standingPosition)) {
                Traveler.travelTo(filler, position.standingPosition, { pushy: true });
            } else {
                runFillerInPlace(filler, position, fillRecords);
            }
        }
        //Can't really tolerate duplicates well. Kill the old
        else {
            let container = Game.getObjectById(position.containerId);
            if (
                container &&
                container instanceof StructureContainer &&
                filler.store.getUsedCapacity(RESOURCE_ENERGY) > 0
            ) {
                //Try to transfer everything into the container. No worries if we fail. We will pick up any tombstones/resources later
                filler.transfer(container, RESOURCE_ENERGY);
            }
            filler.suicide();
        }
    }
}

function runFillerInPlace(filler: Creep, position: FillerPosition, oldRecords: FillRecords) {
    Traveler.reservePosition(filler.pos);

    //When we first arrive, check for resources dropped by the last fast filler
    if (filler.ticksToLive! > 1450 && filler.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        let droppedEnergy = filler.pos.lookFor(LOOK_RESOURCES).filter(r => r.resourceType === RESOURCE_ENERGY);
        let tombstones = filler.pos.lookFor(LOOK_TOMBSTONES).filter(t => t.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
        if (droppedEnergy.length) filler.pickup(droppedEnergy[0]);
        else if (tombstones.length) filler.withdraw(tombstones[0], RESOURCE_ENERGY);
    }

    // try to keep enough on hand to fill all nearby spawn structures
    let spawnRecord = fillRecordFor(position.spawnId, position.spawnId ? oldRecords[position.spawnId] : undefined);
    let newRecords: FillRecord[] = [];
    if (spawnRecord?.structure && spawnRecord.newCapacity < spawnRecord.maxCapacity) newRecords.push(spawnRecord);
    position.extensionIds
        .map(eId => fillRecordFor(eId, oldRecords[eId as string]))
        .filter(r => r.structure && r.newCapacity < r.maxCapacity)
        .forEach(r => newRecords.push(r));

    let containerRecord = fillRecordFor(position.containerId, oldRecords[position.containerId]);
    let linkRecord = fillRecordFor(position.linkId, position.linkId ? oldRecords[position.linkId] : undefined);
    let result: ScreepsReturnCode | undefined;

    //If there are things to fill and we can fill them
    if (newRecords.length && filler.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        //Put energy in the thing
        let amount = Math.min(
            newRecords[0].maxCapacity - newRecords[0].newCapacity,
            filler.store.getUsedCapacity(RESOURCE_ENERGY)
        );
        result = filler.transfer(newRecords[0].structure!, RESOURCE_ENERGY, amount);

        if (result === OK) newRecords[0].newCapacity += amount;
        filler.queueSay("🔼");
    }
    //If there are things to fill, we don't have energy, and we have a container with resources
    else if (
        containerRecord.structure &&
        containerRecord.newCapacity > 0 &&
        newRecords.length &&
        filler.store.getUsedCapacity(RESOURCE_ENERGY) === 0
    ) {
        //pull energy from the container
        let amount = Math.min(
            containerRecord.newCapacity,
            containerRecord.structure!.store.getUsedCapacity(RESOURCE_ENERGY) ?? 1000,
            filler.store.getFreeCapacity(RESOURCE_ENERGY)
        );
        result = filler.withdraw(containerRecord.structure, RESOURCE_ENERGY, amount);
        if (result === OK) containerRecord.newCapacity -= amount;
        filler.queueSay("🔽🏧");
    }
    //If the link exists and has energy, and either the creep or the container has space
    else if (
        linkRecord.structure &&
        linkRecord.newCapacity > 0 &&
        ((containerRecord && containerRecord.newCapacity < containerRecord.maxCapacity) ||
            filler.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    ) {
        //Pull energy from the link
        let amount = Math.min(
            containerRecord.newCapacity,
            linkRecord.newCapacity,
            linkRecord.structure!.store.getUsedCapacity(RESOURCE_ENERGY) ?? 1000,
            filler.store.getFreeCapacity(RESOURCE_ENERGY)
        );
        result = filler.withdraw(linkRecord.structure, RESOURCE_ENERGY, amount);
        if (result === OK) linkRecord.newCapacity -= amount;
        filler.queueSay("🔽🔗");
    }
    //If there is nothing to fill and the creep has energy, and the container has room, and there is a link to refill with
    else if (
        newRecords.length === 0 &&
        linkRecord.structure &&
        filler.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
        containerRecord.newCapacity < containerRecord.maxCapacity
    ) {
        //Put energy back in the container so that we can pull more from the link when it fills
        let amount = Math.min(
            containerRecord.maxCapacity - containerRecord.newCapacity,
            filler.store.getUsedCapacity(RESOURCE_ENERGY)
        );
        result = filler.transfer(containerRecord.structure!, RESOURCE_ENERGY, amount);
        if (result === OK) containerRecord.newCapacity += amount;
        filler.queueSay("🔼🏧");
    }

    //Update all the records with new predicted values. Only update if the structure has an id
    if (containerRecord.structure) oldRecords[containerRecord.structure.id] = containerRecord;
    if (linkRecord.structure) oldRecords[linkRecord.structure.id] = linkRecord;
    for (let fillRecord of newRecords) {
        if (fillRecord.structure) {
            oldRecords[fillRecord.structure.id] = fillRecord;
        }
    }
}

function fillRecordFor(id?: string, oldRecord?: FillRecord): FillRecord {
    if (!id) return { structure: undefined, newCapacity: 0, maxCapacity: 0 };

    if (oldRecord) return oldRecord;
    let structure = Game.getObjectById(id) as AnyStoreStructure | undefined;
    if (structure && !structure.isActive()) structure = undefined;

    return {
        structure: structure,
        newCapacity: structure?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0,
        maxCapacity: structure?.store.getCapacity(RESOURCE_ENERGY) ?? 0
    };
}

//TODO place resource transfer requests for our containers if there isn't a link, or if the link is empty.
// update the requests if there are any and the container isn't full to prevent hauler thrashing
// discard the request when the containers fill up
