import {_creepManifest} from "./CreepManifest";

const PART_ORDER: BodyPartConstant[] = [TOUGH, WORK, CARRY, ATTACK, RANGED_ATTACK, CLAIM, HEAL, MOVE];
const DEFAULT_SORTER: BodySorter = function (a: BodyPartConstant, b: BodyPartConstant): number {
    return PART_ORDER.indexOf(a) - PART_ORDER.indexOf(b);
};

const defaultPriorities = [
    "Primordial", //Initial fast startup creeps
    "Summoner", //Fast filler
    "Drudge", //Hauler
    "Exhumer", //Miner
    "Aspect", //Scout
    "Artificer", //Worker
    "Priest", //Upgrader
    "Sludger" //Mineral miner
];

export const _priorityComparator = (a: CreepConfig, b: CreepConfig) => {
    let aPriority = defaultPriorities.indexOf(a.jobName);
    if(aPriority === -1) aPriority = 9999999
    let bPriority = defaultPriorities.indexOf(b.jobName) ?? 9999999;
    if(bPriority === -1) bPriority = 9999999
    if (aPriority === bPriority) {
        aPriority = a.subPriority ?? 9999999;
        bPriority = b.subPriority ?? 9999999;
    }
    return aPriority - bPriority;
};

export function _shouldAssignConfigToRoom(roomName: string, config: CreepConfig): boolean {
    let room = Game.rooms[roomName];
    //Can't spawn the creep if we don't have room vision
    if (!room) return false;

    let cost = _bodyCost(config.body);
    if (room.energyCapacityAvailable >= cost) return true;
    return false;
}

export function _maximizeBodyForTargetParts(
    baseBody: BodyPartConstant[],
    repeatingBody: BodyPartConstant[],
    targetPart: BodyPartConstant,
    targetNumber: number,
    maxCapacity: number,
    maxCreeps: number = 999,
    sorter?: BodySorter
): BodyPartConstant[][] {
    if (!sorter) sorter = DEFAULT_SORTER;

    let bodies: BodyPartConstant[][] = [];

    let usedParts = 0;
    let baseBodyPartUsage = _.filter(baseBody, part => part === targetPart).length;
    let repeatingBodyPartUsage = _.filter(repeatingBody, part => part === targetPart).length;
    let baseCost = _bodyCost(baseBody);
    let repeatingCost = _bodyCost(repeatingBody);

    do {
        let currentBody: BodyPartConstant[] = baseBody.slice();
        let bodyEnergyCost = baseCost;
        usedParts += baseBodyPartUsage;

        while (
            bodyEnergyCost + repeatingCost <= maxCapacity &&
            currentBody.length + repeatingBody.length <= 50 &&
            usedParts < targetNumber
            ) {
            currentBody = currentBody.concat(repeatingBody);
            bodyEnergyCost += repeatingCost;
            usedParts += repeatingBodyPartUsage;
        }

        currentBody.sort(sorter);
        bodies.push(currentBody);
    } while (usedParts < targetNumber && maxCreeps > bodies.length);

    return bodies;
}

export function _maximizeBody(
    baseBody: BodyPartConstant[],
    repeatingBody: BodyPartConstant[],
    maxCapacity: number,
    sorter?: BodySorter
): BodyPartConstant[] {
    if (!sorter) sorter = DEFAULT_SORTER;

    let body: BodyPartConstant[] = baseBody.concat([]);

    let capacity = _bodyCost(baseBody);
    if (repeatingBody.length > 0) {
        let incement = _bodyCost(repeatingBody);
        while (capacity + incement <= maxCapacity && body.length + repeatingBody.length <= 50) {
            body = body.concat(repeatingBody);
            capacity += incement;
        }
    }

    body = body.sort(sorter);
    return body;
}

export function _bodyCost(body: BodyPartConstant[]) {
    return body.reduce(function (cost, part) {
        return cost + BODYPART_COST[part];
    }, 0);
}

export function _configShouldBeSpawned(config: CreepConfig): boolean {
    let currentPopulation = _creepManifest
        ._getCreeps(config.handle, config.subHandle)
        .filter(c => !_isReadyForPrespawn(c, config)).length;
    return currentPopulation < config.quantity;
}

export function _isReadyForPrespawn(creep: Creep, config: CreepConfig): boolean {
    let partPrespawn = config.dontPrespawnParts ? 0 : config.body.length * 3;
    let totalPrespawn = partPrespawn + (config.additionalPrespawntime ?? 0);
    let ticksUntilPrespawn = (creep.ticksToLive ?? CREEP_LIFE_TIME) - totalPrespawn;
    return ticksUntilPrespawn <= 0;
}

export function _haveSufficientCapacity(room: Room, config: CreepConfig): boolean {
    return room.energyCapacityAvailable >= _bodyCost(config.body);
}
