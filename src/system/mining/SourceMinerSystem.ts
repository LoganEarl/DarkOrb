import { getMapData } from "system/scouting/ScoutInterface";
import { shardScoutSystem } from "system/scouting/ShardScoutSystem";
import { Log } from "utils/logger/Logger";
import { MemoryComponent } from "utils/MemoryWriter";
import { unpackId, unpackPosList } from "utils/Packrat";
import { Traveler } from "utils/traveler/Traveler";

class SourceMinerSystem implements MemoryComponent {
    private memory?: SourceMinerMemory;
    private roomName: string;
    private parentRoomName: string;
    private sourceId: Id<Source | Mineral>;
    private freeSpaces: RoomPosition[] = [];

    constructor(sourceId: Id<Source | Mineral>, isSource: boolean, roomName: string, parentRoomName: string) {
        this.sourceId = sourceId;
        this.roomName = roomName;
        this.parentRoomName = parentRoomName;

        let roomData = getMapData(roomName);
        if (isSource && roomData?.miningInfo) {
            let ourSourceData = _.find(
                roomData!.miningInfo!.sources,
                s => unpackId(s.packedId) == (sourceId as string)
            );
            if (ourSourceData) {
                this.freeSpaces = unpackPosList(ourSourceData.packedFreeSpots);
            }
        } else if (!isSource && roomData?.miningInfo) {
            this.freeSpaces = unpackPosList(roomData.miningInfo.mineral.packedFreeSpots);
        } else {
            Log.e(`Failed to load source miner system for source:${sourceId} room:${roomName}, missing scouting data`);
        }

        this.loadMemory();
    }

    private loadMemory() {
        if (!this.memory) {
            this.memory = Memory.sourceMinerMemory[this.sourceId as string] ?? {
                state: "New"
            };
        }
    }

    saveMemory(): void {
        throw new Error("Method not implemented.");
    }
}
