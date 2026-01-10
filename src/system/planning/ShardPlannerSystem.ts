import { getRoomData, getShardData, saveMapData } from "system/scouting/ScoutInterface";
import { Log } from "utils/logger/Logger";
import { profile } from "utils/profiler/Profiler";
import { registerResetFunction } from "utils/SystemResetter";
import { _queuedJobs } from "./PlannerInterface";
import { RoomPlannerSystem } from "./RoomPlannerSystem";

const PERFECT_ROAD_COUNT = 80;
const BAD_ROAD_COUNT = 200;
const OPTIMAL_RAMPART_COUNT = 2;
const MAX_RAMPART_COUNT = 50;
const RAMPART_WEIGHT = 5;
const ROAD_WEIGHT = 1;
const TOP_PLANS_TO_KEEP = 3;

@profile
class ShardPlannerSystem {
    private roomPlannerSystems: { [roomName: string]: RoomPlannerSystem } = {};
    private lastSystemIndex = 0;

    public _rescanRooms() {
        // Log.d("Rescanning mining rooms");
        let plannedRooms = Object.keys(this.roomPlannerSystems);
        plannedRooms.forEach(roomName => {
            let roomData = getRoomData(roomName);
            if (
                !Game.rooms[roomName] ||
                !roomData?.roomPlan ||
                Game.rooms[roomName].find(FIND_MY_SPAWNS).length === 0
            ) {
                Log.w(`Unable to plan room with name ${roomName}, unregistering planner`);
            }
        });

        //Make sure we have a planning job in rooms with a completed room plan
        let plannable = _.unique(
            Object.values(Game.spawns)
                .filter(spawn => spawn.isActive() && Game.rooms[spawn.pos.roomName])
                .map(spawn => spawn.pos.roomName)
                .filter(roomName => {
                    const plan = getRoomData(roomName)?.roomPlan;
                    return plan && !plan.wasPruned;
                })
        );
        plannable.forEach(roomName => {
            if (!this.roomPlannerSystems[roomName]) {
                Log.i(`Detected room plans in ${roomName}. Starting planning operations`);
                this.roomPlannerSystems[roomName] = new RoomPlannerSystem(roomName);
            }
        });
    }

    public _queueBuildings() {
        let roomSystems = Object.values(this.roomPlannerSystems);
        if (roomSystems.length) {
            this.lastSystemIndex = (this.lastSystemIndex + 1) % roomSystems.length;
            let system = roomSystems[this.lastSystemIndex];

            let sites = Object.values(Game.constructionSites);
            let remainingSites = MAX_CONSTRUCTION_SITES - sites.length;
            let sitesInRoom = sites.filter(site => site.pos.roomName === system.roomName)?.length ?? 0;
            let sitesPerRoom = Math.floor(MAX_CONSTRUCTION_SITES / roomSystems.length);

            system._queueJobs(_.min([remainingSites, sitesPerRoom - sitesInRoom]));
        }
    }

    public _continuePlanning(): void {
        let job = _queuedJobs[0];
        if (job) {
            let result = job.continuePlanning();
            if (result) {
                if (!job.failReason) {
                    Log.i(`Successfully planned room ${job.roomName}`);
                } else {
                    Log.i(`Failed to plan room ${job.roomName} with status: ${job.failReason}`);
                }

                let mapData = getRoomData(job.roomName);
                if (mapData) {
                    result.score = this._scorePlan(result, job.roomName);
                    mapData.roomPlan = result;
                    saveMapData(mapData);
                    this._pruneRoomPlans();
                }
                _queuedJobs.shift();
            }
        }
    }

    private _scorePlan(plan: PlannedRoom, roomName: string): number {
        const roadCount = plan.roadPositions?.length ?? 0;
        const wallCount = plan.wallPositions?.length ?? 0; // Ramparts

        const roadScoreContribution = Math.max(
            0,
            1 - (Math.max(PERFECT_ROAD_COUNT, roadCount) - PERFECT_ROAD_COUNT) / (BAD_ROAD_COUNT - PERFECT_ROAD_COUNT)
        );

        const rampartScoreContribution = Math.max(
            0,
            1 -
            (Math.max(OPTIMAL_RAMPART_COUNT, wallCount) - OPTIMAL_RAMPART_COUNT) /
            (MAX_RAMPART_COUNT - OPTIMAL_RAMPART_COUNT)
        );

        const totalWeight = ROAD_WEIGHT + RAMPART_WEIGHT;
        const combinedScore =
            (roadScoreContribution * ROAD_WEIGHT + rampartScoreContribution * RAMPART_WEIGHT) / totalWeight;
        let finalScore = combinedScore * 100;

        const roomData = getRoomData(roomName);
        if (roomData?.miningInfo?.sources.length === 1) {
            finalScore /= 2;
        }

        return finalScore;
    }

    private _pruneRoomPlans(): void {
        const allRoomsWithData = Object.values(getShardData());
        const roomsWithPlans = allRoomsWithData.filter(r => !!r.roomPlan?.score)
            .filter(r => r.ownership?.username !== global.PLAYER_USERNAME)
            .filter(r => r.ownership?.ownershipType !== "Claimed")

        roomsWithPlans.sort((a, b) => (b.roomPlan?.score ?? 0) - (a.roomPlan?.score ?? 0));

        if (roomsWithPlans.length > TOP_PLANS_TO_KEEP) {
            const roomsToPrune = roomsWithPlans.slice(TOP_PLANS_TO_KEEP);

            for (const roomInfo of roomsToPrune) {
                if (!roomInfo) continue;

                if (roomInfo.roomPlan && !roomInfo.roomPlan.wasPruned) {
                    const score = roomInfo.roomPlan.score;
                    roomInfo.roomPlan = { score: score, wasPruned: true };
                    saveMapData(roomInfo);
                    Log.i(`Pruned room plan for ${roomInfo.roomName} due to low score (${score.toFixed(2)}).`);
                }
            }
        }
    }
}

export let _shardPlannerSystem: ShardPlannerSystem = new ShardPlannerSystem();
registerResetFunction(() => (_shardPlannerSystem = new ShardPlannerSystem()));
