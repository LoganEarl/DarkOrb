import { getMainStorage } from "system/storage/StorageInterface";
import { unpackCoordList, unpackId, unpackPosList } from "utils/Packrat";
import { _calcualteMiningPath } from "./MinerLogic";
import { SourceMinerSystem } from "./SourceMinerSystem";

//TODO Hardcoded for now. Replace when I have spawn loading controls
const MAX_MINING_OPERATIONS = 6;
export class RoomMinerSystem {
    private sourceMinerSystems: { [sourceId: string]: SourceMinerSystem } = {};
    private roomName: string;

    constructor(roomName: string) {
        this.roomName = roomName;
    }

    //This is expensive. Avoid calling if possible
    _getLengthToSource(sourceId: Id<Source>, mapData: RoomScoutingInfo): number {
        let packedFreeSpots = _.find(
            mapData.miningInfo?.sources ?? [],
            s => unpackId(s.packedId) === (sourceId as string)
        )?.packedFreeSpots;
        let mainStorage = getMainStorage(this.roomName);
        if (packedFreeSpots !== undefined && mainStorage !== undefined) {
            let miningPath = _calcualteMiningPath(mainStorage.pos, unpackPosList(packedFreeSpots)[0]);
            return miningPath.incomplete ? 999 : miningPath.path.length;
        }
        return 999;
    }

    //We have been partitioned a source. Make a system for it.
    _registerSource(sourceId: Id<Source>, mapData: RoomScoutingInfo): void {
        //Only register a new system if we don't already have it registered
        if (!this.sourceMinerSystems[sourceId as string]) {
            this.sourceMinerSystems[sourceId as string] = new SourceMinerSystem(
                sourceId,
                true,
                mapData.roomName,
                this.roomName
            );
        }
    }

    _reloadActiveMiningJobs() {
        let jobs = Object.values(this.sourceMinerSystems).sort((a, b) => a.pathLength - b.pathLength);
        for (let i = 0; i < jobs.length; i++) {
            if (i < MAX_MINING_OPERATIONS) {
                jobs[i]._start();
            } else {
                jobs[i]._stop();
            }
        }
    }

    _unregisterSource(sourceId: string) {
        //Only unregister it if we actually have it
        if (this.sourceMinerSystems[sourceId as string]) {
            delete this.sourceMinerSystems[sourceId as string];
        }
    }

    _visualize() {
        Object.values(this.sourceMinerSystems).forEach(s => s._visualize());
    }

    _reloadAllConfigs() {
        Object.values(this.sourceMinerSystems).forEach(s => s._reloadCreepConfigs());
    }

    _reloadAllPathInfo() {
        Object.values(this.sourceMinerSystems).forEach(s => s._reloadPathInfo());
    }
}
