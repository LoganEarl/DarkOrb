import { getRallyPosition, scoutRoom } from "system/scouting/ScoutInterface";
import { getCreeps, maximizeBody, registerCreepConfig, unregisterHandle } from "system/spawning/SpawnInterface";
import { getMainStorage } from "system/storage/StorageInterface";
import { FEATURE_VISUALIZE_HAULING } from "utils/featureToggles/FeatureToggleConstants";
import { getFeature } from "utils/featureToggles/FeatureToggles";
import { profile } from "utils/profiler/Profiler";
import { Traveler } from "utils/traveler/Traveler";
import { clamp, drawBar, drawCircledItem } from "utils/UtilityFunctions";
import { getNode, getNodes, unregisterNode } from "./HaulerInterface";
import { haulerLogic } from "./HaulerLogic";

const MAX_HAULERS_PER_ROOM = 25; //Total haulers a single room can have after rcl3
const MAX_HAULERS_PER_ROOM_LOW_RCL = 60; //Total haulers a single room can have before rcl4
const HAULER_SAFTEY_MARGIN = 1.2; //How many more haulers we will spawn than we think we need

@profile
export class RoomHaulerSystem {
    private roomName: string;

    //These both hold the same data, they are just indexed differently. Need to keep them in sync
    private haulerAssignments: { [haulerName: string]: LogisticsPairing } = {};
    private nodeAssignments: { [nodeId: string]: LogisticsPairing[] } = {};

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
        this.targetCarryParts = 0;
        let nodes = getNodes(this.roomName);
        //console.log(`Calculating logistics node creeps`)
        for (let node of Object.values(nodes)) {
            const carryParts = Math.ceil(
                ((node.serviceRoute.pathLength * 2 * Math.abs(node.bodyDrdt ?? node.baseDrdt)) / 50) *
                    HAULER_SAFTEY_MARGIN
            );
            this.targetCarryParts += carryParts;
        }

        let existingCreeps = getCreeps(this.handle);
        let spawnStarter = existingCreeps.length === 0;

        let room = Game.rooms[this.roomName];
        if (room && (this.targetCarryParts > 0 || spawnStarter)) {
            let maxCreeps = room.controller!.level <= 3 ? MAX_HAULERS_PER_ROOM_LOW_RCL : MAX_HAULERS_PER_ROOM;
            let body = [];
            if (this.buildRoadedCreeps) {
                body = maximizeBody([MOVE, CARRY, CARRY], [MOVE, CARRY, CARRY], room.energyCapacityAvailable);
            } else {
                body = maximizeBody([MOVE, CARRY], [MOVE, CARRY], room.energyCapacityAvailable);
            }
            let carryPerBody = _.sum(body, p => (p === CARRY ? 1 : 0));
            let numCreeps = clamp(_.ceil(this.targetCarryParts / carryPerBody), 1, maxCreeps);

            let configs: CreepConfig[] = [
                {
                    body: body,
                    handle: this.handle,
                    jobName: "Drudge",
                    quantity: numCreeps,
                    additionalPrespawntime: 20
                }
            ];

            if (spawnStarter) {
                configs.push({
                    body: [CARRY, MOVE],
                    handle: this.handle,
                    jobName: "Primordial",
                    quantity: 1,
                    subPriority: 1
                });
            }
            registerCreepConfig(this.handle, configs);
        } else {
            unregisterHandle(this.handle);
        }
    }

    public _runCreeps() {
        let storage = getMainStorage(this.roomName);
        if (!storage) return;

        let nodes = getNodes(this.roomName);

        let creeps = getCreeps(this.handle);
        let toRunAgain: { [creepName: string]: HaulerRunResults } = {};
        for (let creep of creeps) {
            scoutRoom(creep.room);
            let pairing: LogisticsPairing | null = this.haulerAssignments[creep.name];
            // Log.d(`Current pairing for ${creep}, ${JSON.stringify(pairing)}`);
            //If we don't have a job for the creep get it one
            if (!pairing || !nodes[pairing.nodeId]) {
                //Assign the job
                pairing = haulerLogic.assignJobForHauler(
                    creep,
                    this.haulerAssignments,
                    this.nodeAssignments,
                    nodes,
                    storage
                );
            }

            // Log.d(`Assigned pairing for ${creep}, ${JSON.stringify(pairing)}`);

            if (pairing) {
                this.haulerAssignments[creep.name] = pairing;
                let node = getNode(this.roomName, pairing.nodeId);
                let results = haulerLogic.runHauler(creep, pairing, node!, storage!, this.roomName, [
                    this.handle,
                    "Drudge"
                ]);
                if (results.done) {
                    this.completeAssignment(creep);
                    toRunAgain[creep.name] = results;
                }
                if (results.invalidNode && node) {
                    //Remove bad nodes
                    delete nodes[node.nodeId];
                }
            } else {
                let rally = getRallyPosition(this.roomName);
                if (rally) {
                    Traveler.travelTo(creep, rally, { range: 3 });
                }
                creep.sayWaiting();
            }
        }

        //So there is not a 1 tick wait between job assignments
        for (let haulerName in toRunAgain) {
            const hauler = Game.creeps[haulerName];
            const lastResults = toRunAgain[haulerName];
            let pairing: LogisticsPairing | null = this.haulerAssignments[haulerName];
            if (!pairing) {
                pairing = haulerLogic.assignJobForHauler(
                    hauler,
                    this.haulerAssignments,
                    this.nodeAssignments,
                    nodes,
                    storage,
                    lastResults
                );
            }
            if (pairing) {
                let node = getNode(this.roomName, pairing.nodeId);
                haulerLogic.runHauler(
                    hauler,
                    pairing,
                    node!,
                    storage!,
                    this.roomName,
                    [this.handle, "Drudge"],
                    lastResults
                );
            }
        }
    }

    public _visualize() {
        if (!getFeature(FEATURE_VISUALIZE_HAULING)) return;
        let nodes = getNodes(this.roomName);

        let visuals: { [roomName: string]: RoomVisual } = {};
        for (const node of Object.values(nodes)) {
            const roomName = node.lastKnownPosition.roomName;
            if (!visuals[roomName]) visuals[roomName] = new RoomVisual(roomName);

            let symbol = node.type === "Sink" ? "+" : "-";
            let color = node.type === "Sink" ? "green" : "yellow";
            let text = `${symbol}${node.level}/${node.maxLevel} (${node.baseDrdt})`;

            drawCircledItem(node.lastKnownPosition, color, "solid", 0.4, text, visuals[roomName]);
        }

        let numCarry = _.sum(getCreeps(this.handle), c => _.sum(c.body, p => (p.type === CARRY ? 1 : 0)));
        Game.rooms[this.roomName]?.visual.text("Populations", 48.8, 0.6, {
            color: "gray",
            font: 0.6,
            align: "right",
            fontFamily: "Courier New"
        });
        drawBar(
            `HaulerParts: ${numCarry}/${this.targetCarryParts}`,
            1,
            numCarry / this.targetCarryParts,
            Game.rooms[this.roomName].visual
        );
    }

    private completeAssignment(hauler: Creep) {
        let pairing = this.haulerAssignments[hauler.name];
        if (pairing) {
            delete this.haulerAssignments[hauler.name];
            let index = this.nodeAssignments[pairing.nodeId]?.indexOf(pairing);
            if (index != undefined && index != -1) this.nodeAssignments[pairing.nodeId].splice(index, 1);
        }
    }
}
