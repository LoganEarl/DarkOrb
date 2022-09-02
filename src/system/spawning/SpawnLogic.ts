import { _creepManifest } from "./CreepManifest";

const PART_ORDER: BodyPartConstant[] = [TOUGH, WORK, CARRY, ATTACK, RANGED_ATTACK, CLAIM, HEAL, MOVE];
const DEFAULT_SORTER: BodySorter = function (a: BodyPartConstant, b: BodyPartConstant): number {
    return PART_ORDER.indexOf(a) - PART_ORDER.indexOf(b);
};

export function _maximizeBodyForTargetParts(
    baseBody: BodyPartConstant[],
    repeatingBody: BodyPartConstant[],
    targetPart: BodyPartConstant,
    targetNumber: number,
    maxCapacity: number,
    maxCreeps?: number,
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
        let currentBody: BodyPartConstant[] = Object.assign([], baseBody);
        let bodyEnergyCost = baseCost;
        usedParts += baseBodyPartUsage;

        while (
            bodyEnergyCost + repeatingCost <= maxCapacity &&
            currentBody.length + repeatingBody.length <= 50 &&
            usedParts + repeatingBodyPartUsage <= targetNumber
        ) {
            currentBody = currentBody.concat(repeatingBody);
            bodyEnergyCost += repeatingCost;
            usedParts += repeatingBodyPartUsage;
        }

        bodies.push(currentBody.sort(sorter));
    } while (usedParts + baseBodyPartUsage <= targetNumber && (maxCreeps ?? bodies.length) >= bodies.length);

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
        ._getCreeps(config.handle)
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
