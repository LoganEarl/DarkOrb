import { getCreeps, maximizeBody, registerCreepConfig, unregisterHandle } from "system/spawning/SpawnInterface";
import { getMainStorage } from "system/storage/StorageInterface";
import { FEATURE_VISUALIZE_HAULING } from "utils/featureToggles/FeatureToggleRegistry";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { PriorityQueue } from "utils/PriorityQueue";
import { clamp, drawCircledItem } from "utils/UtilityFunctions";
import { _assignJobForHauler, _lookupNodeTarget, _pairingComparitor, _runHauler } from "./HaulerLogic";

const MAX_HAULERS_PER_ROOM = 25; //Total haulers a single room can have after rcl3
const MAX_HAULERS_PER_ROOM_LOW_RCL = 60; //Total haulers a single room can have before rcl4
const MAX_ASSIGNMENTS_PER_NODE = 10; //No more than this many creeps assigned to a single node
const HAULER_SAFTEY_MARGIN = 1.2; //How many more haulers we will spawn than we think we need

class RoomHaulerSystem {
    private logisticsNodeProviders: { [id: string]: LogisticsNodeProvidor } = {};
    private logisticsNodes: { [id: string]: LogisticsNode } = {};

    private roomName: string;

    //These both hold the same data, they are just indexed differently. Need to keep them in sync
    private haulerAssignments: { [haulerName: string]: LogisticsPairing } = {};
    private nodeAssignments: { [nodeId: string]: PriorityQueue<LogisticsPairing> } = {};

    private targetCarryParts = 0;
    private buildRoadedCreeps = false;
    private lastNodeUpdate = 0;

    constructor(roomName: string) {
        this.roomName = roomName;
    }

    get handle() {
        return "Hauling:" + this.roomName;
    }

    public _reloadConfigs() {
        let room = Game.rooms[this.roomName];
        if (room && this.targetCarryParts > 0) {
            let maxCreeps = room.controller!.level <= 3 ? MAX_HAULERS_PER_ROOM_LOW_RCL : MAX_HAULERS_PER_ROOM;
            let body = [];
            if (this.buildRoadedCreeps) {
                body = maximizeBody([MOVE, CARRY, CARRY], [MOVE, CARRY, CARRY], room.energyCapacityAvailable);
            } else {
                body = maximizeBody([MOVE, CARRY], [MOVE, CARRY], room.energyCapacityAvailable);
            }
            let carryPerBody = _.sum(body, p => (p === CARRY ? 1 : 0));
            let numCreeps = clamp(_.ceil(this.targetCarryParts / carryPerBody), 1, maxCreeps);
            registerCreepConfig(this.handle, [
                {
                    body: body,
                    handle: this.handle,
                    jobName: "Drudge",
                    quantity: numCreeps,
                    additionalPrespawntime: 20
                }
            ]);
        } else {
            unregisterHandle(this.handle);
        }
    }

    public _runCreeps() {
        let storage = getMainStorage(this.roomName);
        if (!storage) return;

        let creeps = getCreeps(this.handle);
        let toRunAgain: { [creepName: string]: HaulerRunResults } = {};
        for (let creep of creeps) {
            let pairing: LogisticsPairing | null = null;
            //If we don't have a job for the creep get it one
            if (
                !this.haulerAssignments[creep.name] ||
                !this.logisticsNodes[this.haulerAssignments[creep.name].nodeId]
            ) {
                this.updateLogisticsNodes();
                //Assign the job
                pairing = _assignJobForHauler(
                    creep,
                    this.haulerAssignments,
                    this.nodeAssignments,
                    this.logisticsNodes,
                    storage
                );
            }

            if (pairing) {
                this.haulerAssignments[creep.name] = pairing;
                let node = this.getLogisticsNode(pairing.nodeId);
                let results = _runHauler(creep, pairing, node, storage!);
                if (results.done) {
                    this.completeAssignment(creep);
                    toRunAgain[creep.name] = results;
                }
            }
        }

        //So there is not a 1 tick wait between job assignments
        for (let haulerName in toRunAgain) {
            const hauler = Game.creeps[haulerName];
            const lastResults = toRunAgain[haulerName];
            let pairing = _assignJobForHauler(
                hauler,
                this.haulerAssignments,
                this.nodeAssignments,
                this.logisticsNodes,
                storage,
                lastResults
            );
            if (pairing) {
                let node = this.getLogisticsNode(pairing.nodeId);
                _runHauler(hauler, pairing, node, storage!, lastResults);
            }
        }
    }

    public _visualize() {
        if (!getFeature(FEATURE_VISUALIZE_HAULING)) return;

        let visuals: { [roomName: string]: RoomVisual } = {};
        for (const node of Object.values(this.logisticsNodes)) {
            const roomName = node.lastKnownPosition.roomName;
            if (!visuals[roomName]) visuals[roomName] = new RoomVisual(roomName);

            let symbol = node.type === "Sink" ? "+" : "-";
            let color = node.type === "Sink" ? "green" : "yellow";
            let text = `${symbol}${node.level}/${node.maxLevel} (${node.baseDrdt})`;

            drawCircledItem(node.lastKnownPosition, color, "solid", 0.4, text, visuals[roomName]);
        }
    }

    private updateLogisticsNodes() {
        if (this.lastNodeUpdate === Game.time) return;
        else this.lastNodeUpdate = Game.time;

        this.logisticsNodes = {};
        this.targetCarryParts = 0;

        //console.log(`Calculating logistics node creeps`)
        for (let provider of Object.values(this.logisticsNodeProviders)) {
            //console.log(`Processing new provider`)
            const nodes = provider.provideLogisticsNodes();
            for (let node of nodes) {
                this.logisticsNodes[node.id] = node;
                this.nodeAssignments[node.id] = new PriorityQueue(MAX_ASSIGNMENTS_PER_NODE, _pairingComparitor);
                const carryParts = Math.ceil(
                    ((node.serviceRoute.pathLength * 2 * Math.abs(node.bodyDrdt ?? node.baseDrdt)) / 50) *
                        HAULER_SAFTEY_MARGIN
                );
                this.targetCarryParts += carryParts;
            }
        }
    }

    private getLogisticsNode(id: string): LogisticsNode {
        return this.logisticsNodes[id] ?? null;
    }

    private completeAssignment(hauler: Creep) {
        let pairing = this.haulerAssignments[hauler.name];
        if (pairing) {
            delete this.haulerAssignments[hauler.name];
            this.nodeAssignments[pairing.nodeId]?.remove(pairing);
        }
    }
}
