import {bodyCost} from "../spawning/SpawnInterface";
import {maxBy} from "../../utils/UtilityFunctions";
import {unpackPos} from "../../utils/Packrat";
import {profile} from "../../utils/profiler/Profiler";


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

@profile
class MilitaryLogic {
    public isObjectiveMet(objective: Objective, activeOperation: ActiveMilitaryOperation, operation: MilitaryOperation) {
        if (objective === "KillEnemyCreeps") {
            let position = unpackPos(operation.packedTargetPosition)
            let room = Game.rooms[position.roomName]
            if (room) {
                //TODO this doesn't have any sort of diplomacy setting. Will need to rewrite eventually
                let creeps = room.find(FIND_HOSTILE_CREEPS)
                return !creeps.length;
            }
        }

        throw new Error("Tried to check state of unknown military Objective: " + objective)
    }

    public isSuccessCriteriaMet(criteria: SuccessCondition, activeOperation: ActiveMilitaryOperation, operation: MilitaryOperation) {
        if(criteria === "ObjectivesCompleted") {
            let unmetObjective = operation.objectives
                .find(objective => !activeOperation.objectiveStates[objective])
            return unmetObjective === undefined
        }

        throw new Error("Tried to check state of unknown military success criteria: " + criteria)
    }

    public isFailureCriteriaMet(condition: FailureCondition) {
        //TODO we don't have any of these yet
        return false;
    }
}

export const militaryLogic = new MilitaryLogic()
