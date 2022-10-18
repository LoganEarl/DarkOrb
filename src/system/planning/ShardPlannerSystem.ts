import { getRoomData, saveMapData } from "system/scouting/ScoutInterface";
import { Log } from "utils/logger/Logger";
import { profile } from "utils/profiler/Profiler";
import { registerResetFunction } from "utils/SystemResetter";
import { _queuedJobs } from "./PlannerInterface";
import { RoomPlannerSystem } from "./RoomPlannerSystem";

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
                .filter(roomName => getRoomData(roomName)?.roomPlan)
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
                    mapData.roomPlan = result;
                    saveMapData(mapData);
                }
                _queuedJobs.shift();
            }
        }
    }
}

export let _shardPlannerSystem: ShardPlannerSystem = new ShardPlannerSystem();
registerResetFunction(() => (_shardPlannerSystem = new ShardPlannerSystem()));
