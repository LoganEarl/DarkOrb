import { FAST_FILLER_CONTAINER_COORDS, FAST_FILLER_SPAWN_COORDS } from "system/planning/stamp/FastFiller";
import { getRoomData } from "system/scouting/ScoutInterface";

export class RoomFastFillerSystem {
    public roomName: string;

    private rightSpawnName?: string;
    private leftSpawnName?: string;
    private topContainerId?: string;
    private bottomContainerId?: string;

    private activeFillerPositions: RoomPosition[] = [];

    constructor(room: Room) {
        this.roomName = room.name;
    }

    _reloadConfigs() {
        let room = Game.rooms[this.roomName];
        let placedFiller = getRoomData(this.roomName)?.roomPlan?.fastFiller;
        if (room && placedFiller) {
            this.rightSpawnName = (
                this.lookupFillerStructure(FAST_FILLER_SPAWN_COORDS[0], STRUCTURE_SPAWN, placedFiller) as
                    | StructureSpawn
                    | undefined
            )?.name;

            this.leftSpawnName = (
                this.lookupFillerStructure(FAST_FILLER_SPAWN_COORDS[1], STRUCTURE_SPAWN, placedFiller) as
                    | StructureSpawn
                    | undefined
            )?.name;

            this.topContainerId = this.lookupFillerStructure(
                FAST_FILLER_CONTAINER_COORDS[0],
                STRUCTURE_CONTAINER,
                placedFiller
            )?.id;
            this.bottomContainerId = this.lookupFillerStructure(
                FAST_FILLER_CONTAINER_COORDS[1],
                STRUCTURE_CONTAINER,
                placedFiller
            )?.id;
        }
    }

    private lookupFillerStructure(
        stampOffset: Coord,
        structureType: StructureConstant,
        placedFiller: PlacedStructureGroup
    ) {
        let position = new RoomPosition(
            placedFiller.dx + stampOffset.x,
            placedFiller.dy + stampOffset.y,
            this.roomName
        );
        return position.lookForStructure(structureType);
    }
}
