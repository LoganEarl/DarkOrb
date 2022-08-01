Creep.prototype.getBodyPower = function (selectedPart: BodyPartConstant, operation: any, basePower: number): number {
    return _.sum(this.body, part => {
        if (part.type === selectedPart && part.hits > 0) {
            if (part.boost && Object.keys(BOOSTS[selectedPart as string]).includes(part.boost as string))
                return basePower * BOOSTS[selectedPart as string][part.boost][operation];
            return basePower;
        }

        return 0;
    });
};

let queueTick = 0;
let creepSayQueue: { [creepName: string]: string } = {};

Creep.prototype.queueSay = function (toSay: string, toAll?: boolean): void {
    if (Game.time !== queueTick) {
        queueTick = Game.time;
        creepSayQueue = {};
    }

    creepSayQueue[this.name] = (creepSayQueue[this.name] ?? "") + toSay;
};

export function sayAll() {
    for (let name of Object.keys(creepSayQueue)) {
        Game.creeps[name]?.say(creepSayQueue[name], true);
    }
}

Creep.prototype.getTicksToMove = function (totalCost: number, numPathSteps: number): number {
    const avgTerrainCost = totalCost / numPathSteps;
    const numHeavyParts = this.body.length - this.getActiveBodyparts(MOVE);
    const totalFatigue = Math.ceil(avgTerrainCost * numHeavyParts) * numPathSteps;
    const movePower = this.getBodyPower(MOVE, "fatigue", 1) * 2;
    return Math.max(numPathSteps, Math.ceil(totalFatigue / movePower));
};
