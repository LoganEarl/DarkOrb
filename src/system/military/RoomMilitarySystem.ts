import { profile } from "../../utils/profiler/Profiler";
import { MemoryComponent, updateMemory } from "../../utils/MemoryWriter";
import { getMilitaryOperations } from "./MilitaryInterface";
import { groupBy, minBy, removeItem } from "../../utils/UtilityFunctions";
import { militaryLogic, MilitaryUnitDefinitions } from "./MilitaryLogic";
import { Log } from "../../utils/logger/Logger";

const MAX_ACTIVE_MILITARY_OPERATIONS = 1

@profile
export class RoomMilitarySystem implements MemoryComponent {
    public roomName: string
    private memory: RoomMilitarySystemMemory | undefined


    constructor(roomName: string) {
        this.roomName = roomName;
    }


    _updateMilitaryOperations(): void {
        this.loadMemory()

        let allOperations = getMilitaryOperations(this.roomName);
        //List of all operations that aren't currently winding down
        let activeOperations =
            groupBy(this.memory!.activeOperations.filter(
                o => o.operationState !== "Canceling" && o.operationState !== "Done"),
                o => o.militaryOperationId)

        //List of active operations that won't be active much longer
        let semiActiveOperations =
            groupBy(this.memory!.activeOperations.filter(
                o => o.operationState === "Canceling" || o.operationState === "Done"
            ), o => o.militaryOperationId)

        //This will look for new operations and decide which ones should be active and which should not
        this.chooseNewOperationsToActivate(allOperations, activeOperations, semiActiveOperations)

        //Go through active operations and evaluate success/failure criteria. Potentially cancel operations
        this.updateActiveOperationState(allOperations, activeOperations, semiActiveOperations)

        //Assign units and control spawning of units in active operations
        this.updateActiveOperationUnitSpawning(allOperations, activeOperations)
    }

    private updateActiveOperationState(allOperations: { [operationId: string]: MilitaryOperation },
        activeOperations: Map<string, ActiveMilitaryOperation>,
        semiActiveOperations: Map<string, ActiveMilitaryOperation>) {
        //Go over active operations
        for (let activeOperation of activeOperations.values()) {
            let operation = allOperations[activeOperation.militaryOperationId]
            //Are objectives met?
            for (let objective of operation.objectives) {
                let currentState = militaryLogic.isObjectiveMet(objective, activeOperation, operation)
                if (activeOperation.objectiveStates[objective] !== currentState) {
                    activeOperation.objectiveStates[objective] = currentState;
                    updateMemory(this);
                }
            }

            //Check if any of our success conditions aren't met. If not, complete the details
            let unmetSuccessCondition = operation.successConditions
                .find(c => !militaryLogic.isSuccessCriteriaMet(c, activeOperation, operation))
            let cancelWithSuccess = unmetSuccessCondition === undefined

            //Check if any of our failure conditions are met. If so, complete the detail
            let metFailureConditions = operation.failureConditions
                .find(c => militaryLogic.isFailureCriteriaMet(c))
            let cancelWithFailure = metFailureConditions !== undefined

            if (cancelWithSuccess || cancelWithFailure) {
                let reason = cancelWithFailure ? `Failure conditions met: ${JSON.stringify(metFailureConditions)}`
                    : `All success conditions met`
                Log.i(`Starting cancellation of military operation ${activeOperation.militaryOperationId}. ${reason}`)
                activeOperation.operationState = "Canceling"
                activeOperations.delete(activeOperation.militaryOperationId)
                semiActiveOperations.set(activeOperation.militaryOperationId, activeOperation)
                updateMemory(this)
            }
        }

        //Go over the canceling/done operations
        for (let semiActiveOperation of semiActiveOperations.values()) {
            //It is up to each operation to respond to the "Canceling" state and toggle over to "Done", so wait until it is done
            if (semiActiveOperation.operationState === "Done") {
                Log.i(`Military operation: ${semiActiveOperation.militaryOperationId} is done shutting down and has been deleted`)
                semiActiveOperations.delete(semiActiveOperation.militaryOperationId)
                removeItem(this.memory!.activeOperations, semiActiveOperation)
                updateMemory(this)
            }
        }

    }

    private chooseNewOperationsToActivate(allOperations: { [operationId: string]: MilitaryOperation },
        activeOperations: Map<string, ActiveMilitaryOperation>,
        semiActiveOperations: Map<string, ActiveMilitaryOperation>) {


        //Look for any new operations
        for (let operationId in allOperations) {
            let operation = allOperations[operationId]

            //We need to see if the operation is active. We can do this by checking room state
            let activeOperation = activeOperations.get(operation.operationId)
            //If it is not active, it might still be closing down. This will find it if so
            let semiActiveOperation = semiActiveOperations.get(operation.operationId)
            //  If not active and not canceling, check if we should activate it.
            if (!activeOperation && !semiActiveOperation) {
                let newOperation: ActiveMilitaryOperation = {
                    assignedUnitIds: [],
                    militaryOperationId: operation.operationId,
                    priority: operation.priority,
                    objectiveStates: {},
                    operationState: "WaitingForUnitAssignment"
                };
                //Do we have enough slots to activate it?
                if (activeOperations.size < MAX_ACTIVE_MILITARY_OPERATIONS) {
                    this.memory!.activeOperations.push(newOperation)
                    activeOperations.set(newOperation.militaryOperationId, newOperation)
                    updateMemory(this);
                    Log.i(`Activating military operation: ${newOperation.militaryOperationId}`)
                } else {
                    //We know this will have a value since we were out of active operation slots
                    let minPriorityActiveOperation =
                        minBy(this.memory!.activeOperations, a => a.priority)!
                    //If this new operation is higher priority than the lowest priority existing operation
                    if (minPriorityActiveOperation.priority < operation.priority) {
                        //Initiate shutdown for the min priority operation
                        minPriorityActiveOperation.operationState = "Canceling";
                        activeOperations.delete(minPriorityActiveOperation.militaryOperationId);
                        semiActiveOperations.set(minPriorityActiveOperation.militaryOperationId, minPriorityActiveOperation);

                        //Activate the new one
                        let newOperation: ActiveMilitaryOperation = {
                            assignedUnitIds: [],
                            militaryOperationId: operation.operationId,
                            priority: operation.priority,
                            objectiveStates: {},
                            operationState: "WaitingForUnitAssignment"
                        };
                        activeOperations.set(newOperation.militaryOperationId, newOperation);
                        this.memory!.activeOperations.push(newOperation)
                        updateMemory(this);
                        Log.i(`Replacing active military operation: ${minPriorityActiveOperation.militaryOperationId} with higher priority operation: ${newOperation.militaryOperationId}`)
                    }
                }
            }
        }
    }

    private updateActiveOperationUnitSpawning(allOperations: { [operationId: string]: MilitaryOperation },
        activeOperations: Map<string, ActiveMilitaryOperation>) {
        //TODO update spawning information with this function
        //Loop through operations that are waiting for unit assignment and pick units for them
        for (let activeOperation of activeOperations.values()) {
            let operation = allOperations[activeOperation.militaryOperationId];
            if (activeOperation.operationState === "WaitingForUnitAssignment") {
                //TODO assign a unit and toggle over to either "SpawningAndGrouping" or "Attacking" depending on presence of muster creeps
            }

            if (activeOperation.operationState === "SpawningAndGrouping" || activeOperation.operationState === "Attacking") {
                let toRemove: string[] = [];
                for (let unitId of activeOperation.assignedUnitIds) {
                    let activeUnit = this.memory?.activeMilitaryUnits?.find(u => u.unitId === unitId)
                    if (activeUnit) {
                        let unit = MilitaryUnitDefinitions.get(activeUnit.unitType)!;
                        if (activeUnit.musterState === "Spawning" || activeUnit.musterState === "Trickling") {
                            for (let bodyDefinition of unit.creeps) {
                                //Add the creep config
                                //TODO finish this
                                let config: CreepConfig = {
                                    body: bodyDefinition.body,
                                    boosts: bodyDefinition.boosts,
                                    dontPrespawnParts: true,
                                    handle: "",
                                    subHandle: "",
                                    jobName: "Zealot",
                                    memory: undefined,
                                    quantity: 0

                                }
                            }
                        } else {
                            //TODO Remove the creep config from the spawn queue
                        }
                    } else {
                        Log.e(`Failed to find active unit definition in operation: ${activeOperation.militaryOperationId} with id ${unitId}`)
                        toRemove.push(unitId);
                    }
                }

                if (toRemove.length) {
                    for (let unitId of toRemove) removeItem(activeOperation.assignedUnitIds, unitId);
                    updateMemory(this)
                }
            }

        }

        //If the operation is set to trickle, set the creep config
        //If the operation is set to muster, only set the creep config if we are still in the spawning phase
    }


    loadMemory(): void {
        if (!this.memory) {
            this.memory = Memory.militaryMemory?.roomMilitarySystemMemory?.[this.roomName] ?? {
                activeOperations: [],
                activeMilitaryUnits: []
            };
            updateMemory(this);
        }
    }

    saveMemory(): void {
        if (this.memory) {
            if (!Memory.militaryMemory) Memory.militaryMemory = {};
            if (!Memory.militaryMemory.roomMilitarySystemMemory) Memory.militaryMemory.roomMilitarySystemMemory = {}
            Memory.militaryMemory.roomMilitarySystemMemory[this.roomName] = this.memory;
        }
    }


}
