import {getMainStorage} from "system/storage/StorageInterface";
import {unpackPosList} from "utils/Packrat";
import {profile} from "utils/profiler/Profiler";
import {drawBar, maxBy} from "utils/UtilityFunctions";
import {SourceMinerSystem} from "./SourceMinerSystem";
import {minerLogic} from "./MinerLogic";
import {Log} from "../../utils/logger/Logger";
import {getRoomData} from "../scouting/ScoutInterface";

//TODO Hardcoded for now. Replace when I have spawn loading controls
const MAX_REGISTERED_OPERATIONS = 12;
const MAX_MINING_OPERATIONS = 8;

@profile
export class RoomMinerSystem {
    private sourceMinerSystems: Map<string, SourceMinerSystem> = new Map<string, SourceMinerSystem>();
    public roomName: string;

    constructor(roomName: string) {
        this.roomName = roomName;
    }

    //This is expensive. Avoid calling if possible. Has a shitty cache in front all the same though
    private cachedLengthToSource: Map<string, number> = new Map()
    private lastCacheTime = -1
    _getLengthToSource(sourceId: Id<Source>, mapData: RoomScoutingInfo): number {
        if (this.lastCacheTime !== Game.time) {
            this.cachedLengthToSource = new Map();
            this.lastCacheTime = Game.time;
        }
        if (this.cachedLengthToSource.has(sourceId))
            return this.cachedLengthToSource.get(sourceId)!;
        else {
            let packedFreeSpots = _.find(
                mapData.miningInfo?.sources ?? [],
                s => s.id === (sourceId as string)
            )?.packedFreeSpots;
            let mainStorage = getMainStorage(this.roomName);
            let length = 999
            if (packedFreeSpots !== undefined && mainStorage !== undefined) {
                let miningPath = minerLogic._calculateMiningPath(mainStorage.pos, unpackPosList(packedFreeSpots)[0]);
                length = miningPath.incomplete ? 999 : miningPath.path.length;
            }
            this.cachedLengthToSource.set(sourceId, length)
            return length
        }
    }

    //We have been partitioned a source. Make a system for it.
    _registerSource(sourceId: Id<Source>, mapData: RoomScoutingInfo): void {
        //Only register a new system if we don't already have it registered
        if (!this.sourceMinerSystems.has(sourceId as string)) {
            this.sourceMinerSystems.set(sourceId as string, new SourceMinerSystem(
                sourceId,
                true,
                mapData.roomName,
                this.roomName
            ));
        }
    }

    _pruneMiningJobs() {
        let miningJobPathLengths: Map<string, number> = new Map<string, number>();
        this.sourceMinerSystems.forEach(e => {
            miningJobPathLengths.set(
                e.sourceId as string,
                this._getLengthToSource(e.sourceId as Id<Source>, getRoomData(e.roomName)!)
            );
        });

        //If we have more than the max mining operation registration limit, start dropping some
        while (this.sourceMinerSystems.size > MAX_REGISTERED_OPERATIONS) {
            let furthest = maxBy(Array.from(this.sourceMinerSystems.entries()),
                s => miningJobPathLengths.get(s[0]) ?? 9999);
            // Log.d(`We have too many mining operations. Dropping one for ${furthest?.[0]}`)
            if (furthest)
                this.sourceMinerSystems.delete(furthest[0])
            else {
                Log.e("Something went wrong while pruning source miner systems! Quiting early to avoid infitite loop")
                break;
            }
        }
    }

    _reloadActiveMiningJobs() {
        let systemsArray = Array.from(this.sourceMinerSystems.values());
        let jobs = systemsArray
            .sort((a, b) => {
                let result = a.pathLength - b.pathLength;
                if (result === 0) result = a.handle.localeCompare(b.handle)
                return result
            });
        Log.d(`Reloading active mining jobs in room:${this.roomName}. Jobs:${jobs.length}`)
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
        this.sourceMinerSystems.delete(sourceId as string);
    }

    _visualize() {
        let systems = Array.from(this.sourceMinerSystems.values());
        this.sourceMinerSystems.forEach(s => s._visualize());


        let totalWorkPartsWanted = _.sum(systems, s => s.targetWorkParts);
        let numParts = _.sum(systems, s => s.currentParts);
        drawBar(
            `MinerParts: ${numParts}/${totalWorkPartsWanted}`,
            3,
            numParts / totalWorkPartsWanted,
            Game.rooms[this.roomName].visual
        );
    }

    _runCreeps() {
        this.sourceMinerSystems
            .forEach(s => s._runCreeps());
    }

    _reloadAllConfigs() {
        let first = true;
        this.sourceMinerSystems.forEach(s => {
            s._reloadConfigs(first);
            first = false;
        });
    }

    _reloadAllPathInfo() {
        this.sourceMinerSystems.forEach(s => s._reloadPathInfo());
    }
}
