import { fill } from "lodash";
import { getNode, registerNode, unregisterNode } from "system/hauling/HaulerInterface";
import {
    FAST_FILLER_CONTAINER_COORDS,
    FAST_FILLER_SPAWN_COORDS,
    FAST_FILLER_STANDING_POSITIONS
} from "system/planning/stamp/FastFiller";
import { getRoomData } from "system/scouting/ScoutInterface";
import { getMainStorage } from "system/storage/StorageInterface";
import { FEATURE_VISUALIZE_FAST_FILLER } from "utils/featureToggles/FeatureToggleConstants";
import {shouldVisualize} from "utils/featureToggles/FeatureToggles";
import { Log } from "utils/logger/Logger";
import { findPositionsInsideRect, getFreeSpacesNextTo, getMultirooomDistance, roomPos } from "utils/UtilityFunctions";
import { getCreeps, registerCreepConfig, unregisterHandle } from "../SpawnInterface";
import { FillerPosition, FillRecords, runFillersForPosition } from "./FastFillerLogic";

export class RoomFastFillerSystem {
    public roomName: string;

    private rightSpawnName?: string;
    private leftSpawnName?: string;
    private topContainerId?: string;
    private bottomContainerId?: string;

    private fillerPositions: FillerPosition[] = [];

    constructor(room: Room) {
        this.roomName = room.name;
        this._reloadConfigs();
    }

    get handle() {
        return `FastFiller:${this.roomName}`;
    }

    get isActive() {
        return this.fillerPositions.length > 0;
    }

    _runCreeps() {
        let fillRecords: FillRecords = {};
        let creeps = getCreeps(this.handle);
        let visual = new RoomVisual(this.roomName);

        if (this.topContainerId) {
            let topContainer = Game.getObjectById(this.topContainerId) as StructureContainer;
            if (topContainer) this.updateLogisticsNode(topContainer);
        }

        if (this.bottomContainerId) {
            let bottomContainer = Game.getObjectById(this.bottomContainerId) as StructureContainer;
            if (bottomContainer) this.updateLogisticsNode(bottomContainer);
        }

        for (let i = 0; i < this.fillerPositions.length; i++) {
            let fillersForPosition = creeps.filter(creep => creep.memory.subHandle === `Filler #${i}`);

            if (fillersForPosition.length) {
                runFillersForPosition(fillersForPosition, this.fillerPositions[i], fillRecords);
                if (shouldVisualize(FEATURE_VISUALIZE_FAST_FILLER)) {
                    visual.circle(this.fillerPositions[i].standingPosition, { radius: 0.5, fill: "blue" });
                }
            } else {
                if (shouldVisualize(FEATURE_VISUALIZE_FAST_FILLER)) {
                    visual.circle(this.fillerPositions[i].standingPosition, { radius: 0.5, fill: "red" });
                }
            }
        }

        if (shouldVisualize(FEATURE_VISUALIZE_FAST_FILLER)) {
            let placedFiller = getRoomData(this.roomName)?.roomPlan?.fastFiller;
            if (placedFiller) {
                let width = placedFiller.group[8].buildings.length;
                visual.rect(placedFiller.dx + 0.5, placedFiller.dy + 0.5, width - 2, width - 2, {
                    fill: "blue",
                    opacity: 0.1
                });
            }
        }
    }

    _reloadConfigs() {
        let room = Game.rooms[this.roomName];
        let placedFiller = getRoomData(this.roomName)?.roomPlan?.fastFiller;
        if (room && placedFiller) {
            this.rightSpawnName = (
                this.lookupFillerStructure(FAST_FILLER_SPAWN_COORDS[0], STRUCTURE_SPAWN, placedFiller)[0] as
                    | StructureSpawn
                    | undefined
            )?.name;

            this.leftSpawnName = (
                this.lookupFillerStructure(FAST_FILLER_SPAWN_COORDS[1], STRUCTURE_SPAWN, placedFiller)[0] as
                    | StructureSpawn
                    | undefined
            )?.name;

            this.topContainerId = this.lookupFillerStructure(
                FAST_FILLER_CONTAINER_COORDS[0],
                STRUCTURE_CONTAINER,
                placedFiller
            )[0]?.id;
            this.bottomContainerId = this.lookupFillerStructure(
                FAST_FILLER_CONTAINER_COORDS[1],
                STRUCTURE_CONTAINER,
                placedFiller
            )[0]?.id;

            //Prettier gives me rage
            this.fillerPositions = FAST_FILLER_STANDING_POSITIONS.map(coord =>
                this.constructFillerPosition(coord, placedFiller!)
            )
                .filter(f => f)
                .map(f => f!);

            this.fillerPositions.sort((a, b) => {
                let result = a.standingPosition.x - b.standingPosition.x;
                if (result == 0) result = a.standingPosition.y - b.standingPosition.y;
                return result;
            });

            let configs: CreepConfig[] = [];
            for (let i = 0; i < this.fillerPositions.length; i++) {
                let config: CreepConfig = {
                    body: [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE],
                    handle: this.handle,
                    subHandle: `Filler #${i}`,
                    jobName: "Summoner",
                    quantity: 1
                };
                if (this.fillerPositions[i].spawnId && this.fillerPositions[i].direction) {
                    config.spawnPosition = {
                        spawnName: this.fillerPositions[i].spawnId!,
                        directions: [this.fillerPositions[i].direction!]
                    };
                }
                configs.push(config);
            }

            if (configs.length) registerCreepConfig(this.handle, configs, this.roomName);
            else unregisterHandle(this.handle, this.roomName);
        }
    }

    private updateLogisticsNode(container: StructureContainer) {
        let nodeId = "fillerContainer:" + container.id;
        let node = getNode(this.roomName, nodeId);
        //Update the node
        if (node && container.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            node.level = container.store.getUsedCapacity(RESOURCE_ENERGY);
            if (container.store.getUsedCapacity(RESOURCE_ENERGY) > 1000) {
                node.priorityScalar = 10;
            } else {
                node.priorityScalar = 50;
            }
        }
        //Make new node
        else if (container.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            let dist = getMultirooomDistance(getMainStorage(this.roomName)!.pos, container.pos);
            registerNode(this.roomName, this.handle, {
                nodeId: nodeId,
                targetId: container.id,
                level: container.store.getUsedCapacity(RESOURCE_ENERGY),
                maxLevel: container.store.getCapacity(RESOURCE_ENERGY),
                resource: RESOURCE_ENERGY,
                baseDrdt: 0,
                type: "Sink",
                analyticsCategories: [],
                lastKnownPosition: container.pos,
                priorityScalar: 50,
                disableLimitedGrab: true,
                serviceRoute: {
                    pathLength: dist,
                    pathCost: dist * 2
                }
            });
        }
        //Unregister the node
        else if (node) {
            unregisterNode(this.roomName, this.handle, container.id);
        }
    }

    private constructFillerPosition(coord: Coord, placedFiller: PlacedStructureGroup) {
        let pos = new RoomPosition(placedFiller!.dx + coord.x, placedFiller!.dy + coord.y, this.roomName);
        let structures = pos.findInRange(FIND_STRUCTURES, 1);

        let container = structures.filter(s => s.structureType === STRUCTURE_CONTAINER)[0] as
            | StructureContainer
            | undefined;

        //No point if there isn't a container
        if (!container) return undefined;

        //Needs to be at least one extension as well
        let extensions = structures.filter(s => s.structureType === STRUCTURE_EXTENSION && s.isActive());
        if (!extensions.length) return undefined;

        let spawn = structures.filter(s => s.structureType === STRUCTURE_SPAWN)[0] as StructureSpawn | undefined;
        let direction = spawn ? spawn.pos.getDirectionTo(pos) : undefined;

        let fillerPosition: FillerPosition = {
            standingPosition: pos,
            spawnId: spawn?.id as string | undefined,
            direction: direction,
            containerId: container.id,
            extensionIds: extensions.map(e => e.id)
        };

        return fillerPosition;
    }

    private lookupFillerStructure(
        stampOffset: Coord,
        structureType: StructureConstant,
        placedFiller: PlacedStructureGroup,
        range: number = 0
    ): Structure<StructureConstant>[] {
        let position = new RoomPosition(
            placedFiller.dx + stampOffset.x,
            placedFiller.dy + stampOffset.y,
            this.roomName
        );

        let positions = findPositionsInsideRect(
            position.x - range,
            position.y - range,
            position.x + range,
            position.y + range
        );
        return positions
            .map(p => roomPos(p, this.roomName))
            .map(p => p.lookForStructure(structureType))
            .filter(s => s)
            .map(s => s as Structure<StructureConstant>);
    }
}
