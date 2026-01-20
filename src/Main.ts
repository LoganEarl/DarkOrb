import { ProcessRunner } from "core/ProcessRunner";
import * as Profiler from "utils/profiler/Profiler";
import { sayAll } from "prototypes/Creep";
import "./prototypes/RoomPosition";
import "./prototypes/Structures";
import "./prototypes/Creep";
import { hasRespawned, exponentialMovingAverage } from "utils/UtilityFunctions";
import { setFeature, toggleFeature } from "utils/featureToggles/FeatureToggles";
import { updateAllMemory } from "utils/MemoryWriter";
import { Log } from "utils/logger/Logger";
import { SpawnProcess } from "system/spawning/SpawnProcess";
import { ScoutProcess } from "system/scouting/ScoutProcess";
import { resetAllSystems } from "utils/SystemResetter";
import { StorageProcess } from "system/storage/StorageProcess";
import { MinerProcess } from "system/mining/MinerProcess";
import { HaulerProcess } from "system/hauling/HaulerProcess";
import { printSpawnQueues } from "system/spawning/SpawnInterface";
import { WorkerProcess } from "system/working/WorkerProcess";

import "./utils/visual/RoomVisual.js";
import { PlannerProcess as PlannerProcess } from "system/planning/PlannerProcess";
import { showPlannedRooms, clearRoomPlan, getRoomData } from "system/scouting/ScoutInterface";
import { memhack } from "utils/memHack/Memhack";
import { MilitaryProcess } from "./system/military/MilitaryProcess";
import { defend } from "QuickAndDirtyTowers";
import { planRoom } from "system/planning/PlannerInterface";

let deferedInit = false;
let globalRefresh = true;

Log.i(`Global refresh detected, recreating process table`);
global.PLAYER_USERNAME = Game.spawns[Object.keys(Game.spawns)[0]].owner.username;
global.INVADER_USERNAME = "Invader";
global.KEEPER_USERNAME = "Source Keeper";
global.__PROFILER_ENABLED__ = false;

function resetForRespawn() {
    //Clear out memory from old spawn
    Log.w("Fresh spawn detected, clearing all memory");
    let memoryKeys = Object.keys(Memory);
    let excludedKeys = ["featureToggles"];
    memoryKeys.forEach(key => {
        if (!excludedKeys.includes(key)) {
            Log.w("Deleting memory key: " + key);
            (Memory as any)[key] = undefined;
        }
    });

    //Reset systems
    resetAllSystems();
}

var cpu = -1;

function init() {
    if (!Memory.rooms) Memory.rooms = {};

    //===================================================================Initialize Processes

    global.runner = new ProcessRunner();
    global.runner.addProcess(new MilitaryProcess());
    global.runner.addProcess(new SpawnProcess());
    global.runner.addProcess(new ScoutProcess());
    global.runner.addProcess(new StorageProcess());
    global.runner.addProcess(new MinerProcess());
    global.runner.addProcess(new HaulerProcess());
    global.runner.addProcess(new WorkerProcess());
    global.runner.addProcess(new PlannerProcess());

    //===================================================================Initialize Global Functions
    global.processes = () => {
        global.runner.printProcessQueue();
    };
    global.setFeature = setFeature;
    global.toggleFeature = toggleFeature;
    global.spawnQueues = printSpawnQueues;
    global.showPlannedRooms = showPlannedRooms;
    global.replanRoom = (roomName: string) => {
        const room = Game.rooms[roomName]
        if (!room) {
            Log.e(`Cannot replan room ${roomName} without vision`);
            return;
        }
        const roomData = getRoomData(roomName);
        if (!roomData) {
            Log.e(`Cannot manually plan room ${roomName} as we have not scouted it before`);
            return;
        }
        clearRoomPlan(roomName);
        planRoom(room, roomData);
    }

    global.Profiler = Profiler.init();
}

//===================================================================Main Loop
export const loop = memhack(() => {
    try {
        let detectedRespawn = hasRespawned();
        //If we have respawned make sure to reinit all our processes
        if ((globalRefresh || detectedRespawn) && !deferedInit) {
            if (detectedRespawn) {
                resetForRespawn();
            }

            globalRefresh = false;
            if (!Game.cpu.bucket || Game.cpu.bucket > 500) {
                init();
            } else deferedInit = true;
        }

        //If we are waiting to have enough bucket to start up
        if (deferedInit) {
            if (!Game.cpu.bucket || Game.cpu.bucket > 500) {
                deferedInit = false;
                init();
            } else {
                Log.w("Defering code init");
                // exportStats()
                return;
            }
        }

        if (Game.cpu.bucket === 10000 && Game.cpu.generatePixel) {
            //Game.cpu.generatePixel();
        }

        //TODO, replace this with actual military systems. They should be in charge of towers
        defend();

        global.runner.runAll();

        updateAllMemory();

        //Expend all creep speech queues
        sayAll();

        // Automatically delete memory of missing creeps (not that we are using creep memory much)
        for (const name in Memory.creeps) {
            if (!(name in Game.creeps)) {
                delete Memory.creeps[name];
            }
        }

        if (cpu === -1) cpu = Game.cpu.getUsed()
        else {
            cpu = exponentialMovingAverage(Game.cpu.getUsed(), cpu, 100)
        }
        if (Game.time % 100 === 0) Log.d(`Using ${cpu} cpu on average. Bucket:${Game.cpu.bucket}`)
    } catch (e) {
        Log.e("Uncaught error detected", e);
    }
});
