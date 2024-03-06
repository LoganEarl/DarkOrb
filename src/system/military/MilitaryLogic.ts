import {bodyCost} from "../spawning/SpawnInterface";
import {maxBy} from "../../utils/UtilityFunctions";

export const MilitaryUnitDefinitions: Map<MilitaryUnitType, MilitaryUnit> = new Map();
MilitaryUnitDefinitions.set("LowRclDynamicTrio", {
    creeps: [{
        body: [TOUGH, TOUGH, MOVE, MOVE, MOVE, ATTACK, MOVE],
        boosts: []
    }, {
        body: [MOVE, MOVE, MOVE, RANGED_ATTACK],
        boosts: []
    }, {
        body: [MOVE, HEAL],
        boosts: []
    }],
    movementController: "Blob",
    musterBehavior: "Muster"
})
//Need exactly one spawn extension for this one
MilitaryUnitDefinitions.set("LowRclDynamicDuo", {
    creeps: [{
        body: [ATTACK, RANGED_ATTACK, MOVE, MOVE],
        boosts: []
    }, {
        body: [MOVE, MOVE, HEAL],
        boosts: []
    }],
    movementController: "Blob",
    musterBehavior: "Muster"
})

//Do some initialization of calculated fields
for (let entry of MilitaryUnitDefinitions.entries()) {
    let maxBodyDefinition = maxBy(entry[1].creeps,
        bodyDefinition => bodyCost(bodyDefinition.body))
    if (maxBodyDefinition) {
        entry[1].minSpawnCapacity = bodyCost(maxBodyDefinition.body)
    }
    entry[1].requiresBoosts = entry[1].creeps.find(bodyDefinition => bodyDefinition.boosts.length > 0) !== undefined
}