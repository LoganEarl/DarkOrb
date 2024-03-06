/*Overview of how the military system will work
I think the easiest abstraction to make is one of military operations. Here are some examples:
- Attacking another player's remotes
- Killing Invaders in one of our remotes
- Destroying the room of another player

With this in mind, it isn't useful to think of th

As a matter of fact, I would say that making a distinction between attacking and defending is useless here.
They are both just military operations, and will be functionally identical in most cases

With this in mind, what are my abstraction layers?
MilitaryOperation: Details the goal. These can be set externally by other systems
MilitaryUnit: A creep or group of creeps. Can be assigned to military operations

Here are some additional thoughts I have on this system:
- Avoid unit-specific logic whenever possible. I want it to be smart enough to optimally use all units
  I can think of a few possible exceptions to this. For instance, quads will need their own logic

- I want the system to maintain some knowledge about historic fights and how different units fare
  This system should to be able to inform future operations with respect to unit composition
  This system should be clear as to why it makes its decisions. Should be debuggable
  Should keep in mind that asymmetric combat exists. Don't think a given unit comp is bad just because the other guy pulled out T3 boosts

- One idea might be to fingerprint the enemy units. Define a way to sum of parts of creeps, boosts, populations, enemy player, and tower count as a vector
  From there, you can save fight data using domain-relative hashing, and pick solutions based on either past stuff, or try something new on occasion
 */

//These set how our bois will behave in the room. Do they go after creeps? structures? do they siege or just run around killing?
type Objective =
    | "KillEnemyCreeps" //Will just try to kill all enemy creeps in a room

//This will determine what will cause this operation to end with success
type SuccessCriteria =
    | "ObjectivesCompleted" //Will terminate if none of the objectives have targets

//This will determine what will cause this operation to end with a failure. Basically, what causes us to give up?
type FailureCriteria =
    | "CreepsDestroyed" //All our bois died

interface MilitaryOperation {
    operationId: string,
    objectives: Objective[],
    successCriteria: SuccessCriteria[]
    failureCriteria: FailureCriteria[]
    packedTargetPosition: string
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
    | "Trickle"
    | "Muster"

type MovementController =
    | "Individual"
    | "Blob"
    | "Quad"

interface BodyDefinition {
    body: BodyPartConstant[],
    boosts: BoostDefinition[]
}

type MilitaryOperationMemory = { [parentRoomName: string]: { [operationId: string]: MilitaryOperation }}
interface Memory {
    militaryOperations?: MilitaryOperationMemory
}
