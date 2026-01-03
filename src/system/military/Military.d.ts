/*Overview of how the military system will work
I think the easiest abstraction to make is one of military operations. Here are some examples:
- Attacking another player's remotes
- Killing Invaders in one of our remotes
- Destroying the room of another player

As a matter of fact, I would say that making a distinction between attacking and defending is useless here.
They are both just military operations, and will be functionally identical in most cases

With this in mind, what are my abstraction layers?
MilitaryOperation: Details the goal. These can be set externally by other systems
MilitaryUnit: A creep or group of creeps. Can be assigned to military operations

Here are some additional thoughts I have on this system:
- Avoid unit-specific logic whenever possible. I want it to be smart enough to optimally use all units
  I can think of a few possible exceptions to this. For instance, quads will need their own logic. Given that, we can make each
  unit choose from a few pre-baked options for the movement controller or spawning behavior.

- I want the system to maintain some knowledge about historic fights and how different units fare
  This system should to be able to inform future operations with respect to unit composition
  This system should be clear as to why it makes its decisions. Should be debuggable
  Should keep in mind that asymmetric combat exists. Don't think a given unit comp is bad just because the other guy pulled out T3 boosts

- One idea might be to fingerprint the enemy units. Define a way to sum of parts of creeps, boosts, populations, enemy player, and tower count as a vector
  From there, you can save fight data using domain-relative hashing, and pick solutions based on either past stuff, or try something new on occasion
  Since we want to explore different unit comp options over time, we could
 */

//These set how our bois will behave in the room. Do they go after creeps? structures? do they siege or just run around killing?
type Objective =
    | "KillEnemyCreeps" //Will just try to kill all enemy creeps in a room

//This will determine what will cause this operation to end with success
type SuccessCondition =
    | "ObjectivesCompleted" //Will terminate if none of the objectives have targets

//This will determine what will cause this operation to end with a failure. Basically, what causes us to give up?
type FailureCondition =
    | "CreepsDestroyed" //All our bois died


interface MilitaryOperation {
    operationId: string,
    objectives: Objective[],
    //Conditions that must all be met to consider it a success
    successConditions: SuccessCondition[]
    //Conditions that will fail the operation. Any failure criteria will result in termination
    failureConditions: FailureCondition[]
    packedTargetPosition: string
    priority: number
}

interface MilitaryUnit {
    creeps: BodyDefinition[],
    musterBehavior: MusterBehaviour,
    movementController: MovementController
    minSpawnCapacity?: number
    requiresBoosts?: boolean
}

type MilitaryUnitType =
    | "LowRclDynamicTrio"
    | "LowRclDynamicDuo"

type MusterBehaviour =
    //Will cause units to head to the room immediately after spawning
    | "Trickle"
    //Will cause the military units to group up in the parent room, then head to the destination
    | "Muster"

type MovementController =
    //Todo none of these are implemented yet...
    | "Individual"
    | "Blob"
    | "Quad"

type MilitaryOperationState =
    | "WaitingForUnitAssignment" //Bran new, needs some units assigned
    //Units have been assigned, waiting on creeps to spawn and be ready. If set to trickle, this
    // state will be skipped
    | "SpawningAndGrouping"
    //Units are active and getting shit done
    | "Attacking"
    //We either succeeded, failed, or were wiped. Wait for the engine to evaluate how well the
    // current strategy worked before we pick more units to send (or just quit)
    | "WaitingForEvaluation"
    //This operation should shut itself down. Recycle units, finish up, etc, then toggle over to Done
    | "Canceling"
    //This operation is ready for removal
    | "Done"

interface BodyDefinition {
    body: BodyPartConstant[],
    boosts: BoostDefinition[]
}

//Contains state information for how a single room is handling a military operation
interface ActiveMilitaryOperation {
    priority: number, //This is copied over from the MilitaryOperation. It is more convenient this way
    operationState: MilitaryOperationState
    militaryOperationId: string,
    assignedUnitIds: string[],
    objectiveStates: { [objectiveType: string]: boolean }
}

//Displays how far along we are to deploying the unit
type ActiveMilitaryUnitMusterState =
    //Hanging out in spawn room waiting for rest of creeps to come online
    | "Spawning"
    //All units are spawned, forming a group for travel purposes
    | "GroupingSpawnRoom"
    //Optional state for grouping up with multiple units in a staging room.
    | "GroupingStagingRoom"
    //Some Creeps are alive, but not all creeps are alive. Every new creep just immediately heads out to the target room
    //Only really applies if the muster behavior is set to trickle.
    | "Trickling"
    //All creeps have been spawned, no more creeps will be added or respawned until we either end or toggle back to spawning.
    | "Active"

//Contains state information for a single military unit. Things like state tracking, etc
interface ActiveMilitaryUnit {
    musterState: ActiveMilitaryUnitMusterState
    unitType: MilitaryUnitType
    unitId: string
}

//Holds state information for a military unit that is actively being used.
interface RoomMilitarySystemMemory {
    //Contains the operation ids of
    activeOperations: ActiveMilitaryOperation[]
    activeMilitaryUnits: ActiveMilitaryUnit[]
}

type MilitaryOperationMemory = {
    [parentRoomName: string]: { [operationId: string]: MilitaryOperation }
}

interface MilitarySystemMemory {
    roomMilitarySystemMemory?: { [parentRoomName: string]: RoomMilitarySystemMemory }
    militaryOperations?: MilitaryOperationMemory
}

interface Memory {
    militaryMemory?: MilitarySystemMemory
}
