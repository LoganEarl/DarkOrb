import { getNode } from "system/hauling/HaulerInterface";
import { getRallyPosition } from "system/scouting/ScoutInterface";
import {
    getCreeps,
    maximizeBodyForTargetParts,
    registerCreepConfig,
    unregisterHandle
} from "system/spawning/SpawnInterface";
import {
    ANALYTICS_ALL,
    ANALYTICS_ARTIFICER,
    ANALYTICS_GOSS_INCOME,
    ANALYTICS_SPAWNING
} from "system/storage/AnalyticsConstants";
import { getEnergyPerTick } from "system/storage/StorageInterface";
import { Log } from "utils/logger/Logger";
import { MemoryComponent, memoryWriter } from "utils/MemoryWriter";
import { Traveler } from "utils/traveler/Traveler";
import { drawBar } from "utils/UtilityFunctions";
import {
    _constructionPriorities,
    _maintainencePriorities,
    _runCreep,
    _sortDetails,
    _upgraderPriorities
} from "./WorkerLogic";

export class RoomWorkSystem implements MemoryComponent {
    private memory?: WorkMemory;

    public roomName: string;
    private targetWorkParts: number = 0;

    private creepAssignments: { [creepName: string]: string } = {};

    constructor(roomName: string) {
        this.roomName = roomName;
    }

    private get handle() {
        return `Work: ${this.roomName}`;
    }

    _updateWorkDetail(detail: WorkDetail) {
        this.loadMemory();
        let details = this.memory!.details;
        //We store work details in memory, so to avoid mistakes always store a copy not the real thing
        details[detail.detailId] = Object.assign({}, detail);
        memoryWriter.updateComponent(this);
    }

    _visualize() {
        if (Game.rooms[this.roomName]) {
            Object.values(this.memory!.details).forEach(detail => {
                new RoomVisual(detail.destPosition.roomName).rect(
                    detail.destPosition.x - 0.5,
                    detail.destPosition.y - 0.5,
                    1,
                    1,
                    {
                        fill: "transparent",
                        stroke: "yellow"
                    }
                );
            });

            let numWork = _.sum(getCreeps(this.handle), c => _.sum(c.body, p => (p.type === WORK ? 1 : 0)));
            drawBar(
                `WorkerParts: ${numWork}/${this.targetWorkParts}`,
                2,
                numWork / this.targetWorkParts,
                Game.rooms[this.roomName].visual
            );
        }
    }

    _runCreeps() {
        this.loadMemory();
        let focus = this.memory!.focus;
        let details: WorkDetail[] = [];
        let creeps = getCreeps(this.handle);
        let first = true;
        for (let creep of creeps) {
            let assignment: WorkDetail | undefined = this.creepAssignments[creep.name]
                ? this.memory!.details[this.creepAssignments[creep.name]]
                : undefined;
            if (!assignment) {
                if (!details.length) details = Object.values(this.memory!.details);

                let sorted = _sortDetails(creep, details);
                //The first creep is in charge of keeping things running smoothly before the focused task
                if (first) {
                    assignment =
                        _maintainencePriorities(sorted) ??
                        (focus === "Construction" ? _constructionPriorities(sorted) : undefined) ??
                        (focus === "Upgrade" ? _upgraderPriorities(sorted) : undefined);
                } else {
                    assignment =
                        (focus === "Construction" ? _constructionPriorities(sorted) : undefined) ??
                        (focus === "Upgrade" ? _upgraderPriorities(sorted) : undefined) ??
                        _maintainencePriorities(sorted);
                }

                if (assignment) this.creepAssignments[creep.name] = assignment.detailId;
            }

            if (assignment) {
                let results = _runCreep(creep, assignment, this.roomName, this.handle, [this.handle]);
                if (results) {
                    delete this.creepAssignments[creep.name];
                    delete this.memory!.details[assignment.detailId];
                    memoryWriter.updateComponent(this);
                }
            } else {
                let rally = getRallyPosition(this.roomName);
                if (rally) Traveler.travelTo(creep, rally);
                creep.sayWaiting();
            }

            first = false;
        }
    }

    set focus(focus: WorkFocus) {
        this.loadMemory();
        if (this.memory!.focus !== focus) {
            //Remove prev assignemnts when we change focus
            this.creepAssignments = {};
            this.memory!.focus = focus;
            this.memory!.lastFocusUpdate = Game.time;
            memoryWriter.updateComponent(this);
        }
    }

    get focus(): WorkFocus {
        this.loadMemory();
        return this.memory!.focus;
    }

    get lastFocusUpdate() {
        this.loadMemory();
        return this.memory!.lastFocusUpdate;
    }

    _hasWorkDetailsOfType(type: DetailType): boolean {
        this.loadMemory();
        return _.any(Object.values(this.memory!.details), d => d.detailType === type);
    }

    _reloadConfigs() {
        this.loadMemory();
        let details = Object.values(this.memory!.details);
        let focus = this.memory!.focus;

        if (details.length > 0) {
            let configs: CreepConfig[] = [];

            //Net energy not counting workers
            let availableEnergy =
                getEnergyPerTick(this.roomName, ANALYTICS_GOSS_INCOME) +
                getEnergyPerTick(this.roomName, ANALYTICS_SPAWNING) -
                getEnergyPerTick(this.roomName, ANALYTICS_ARTIFICER);
            availableEnergy *= 0.9;

            // Log.d(`Available energy: ${availableEnergy}`);
            //If we are netting low, only make a single dude to maintain things
            if (availableEnergy < 0 || focus === "None") {
                this.targetWorkParts = 1;
                configs = [
                    {
                        handle: this.handle,
                        subHandle: "Artificer",
                        body: [WORK, CARRY, CARRY, CARRY, MOVE],
                        jobName: "Artificer",
                        quantity: 1
                    }
                ];
            } else {
                let bodies: BodyPartConstant[][] = [];
                //These creeps are easier on the hauling system. Build them instead for RCL1
                if (Game.rooms[this.roomName].controller!.level === 1) {
                    this.targetWorkParts = Math.ceil(availableEnergy / UPGRADE_CONTROLLER_POWER);
                    bodies = maximizeBodyForTargetParts(
                        [WORK, CARRY, CARRY, CARRY, MOVE],
                        [WORK, CARRY, MOVE],
                        WORK,
                        this.targetWorkParts,
                        Game.rooms[this.roomName]!.energyCapacityAvailable
                    );
                } else if (focus === "Construction") {
                    //Each part is 5 e/t.
                    this.targetWorkParts = Math.ceil(availableEnergy / BUILD_POWER);
                    bodies = maximizeBodyForTargetParts(
                        [WORK, CARRY, CARRY, CARRY, MOVE],
                        [WORK, CARRY, MOVE],
                        WORK,
                        this.targetWorkParts,
                        Game.rooms[this.roomName]!.energyCapacityAvailable
                    );
                } else if (focus === "Upgrade") {
                    this.targetWorkParts = Math.ceil(availableEnergy / UPGRADE_CONTROLLER_POWER);
                    bodies = maximizeBodyForTargetParts(
                        [WORK, WORK, CARRY, MOVE],
                        [WORK, WORK, CARRY, MOVE],
                        WORK,
                        this.targetWorkParts,
                        Game.rooms[this.roomName]!.energyCapacityAvailable
                    );
                }

                configs = [];
                for (let i = 0; i < bodies.length; i++) {
                    configs.push({
                        handle: this.handle,
                        subHandle: "Artificer:" + i,
                        body: bodies[i],
                        jobName: "Artificer",
                        quantity: 1
                    });
                }
            }
            registerCreepConfig(this.handle, configs, this.roomName);
        } else {
            unregisterHandle(this.handle);
        }
    }

    loadMemory(): void {
        if (!this.memory) {
            if (!Memory.workMemory) Memory.workMemory = {};

            this.memory = Memory.workMemory[this.roomName] ?? {
                details: {},
                focus: "None",
                lastFocusUpdate: Game.time
            };
        }
    }

    saveMemory(): void {
        if (this.memory) {
            Memory.workMemory![this.roomName] = this.memory;
        }
    }
}
