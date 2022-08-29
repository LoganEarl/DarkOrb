import { ErrorMapper } from "utils/ErrorMapper";
import { ProcessRunner } from "core/ProcessRunner";
import * as Profiler from "utils/profiler/Profiler";
import { sayAll } from "model/Creep";
import "./model/RoomPosition";
import "./model/Structures";
import "./model/Creep";
import { hasRespawned } from "utils/UtilityFunctions";
import { setFeature, toggleFeature } from "utils/featureToggles/FeatureToggles";
import { memoryWriter } from "utils/MemoryWriter";
import { shardSpawnSystem } from "system/spawning/ShardSpawnSystem";
import { Log } from "utils/logger/Logger";
import { creepManifest } from "system/spawning/CreepManifest";
import { SpawnProcess } from "system/spawning/SpawnProcess";
import { ScoutProcess } from "system/scouting/ScoutProcess";
import { resetAllSystems } from "utils/SystemResetter";

let deferedInit = false;
let globalRefresh = true;

Log.i(`Global refresh detected, recreating process table`);

function resetForRespawn() {
    //Clear out memory from old spawn
    Log.w("Fresh spawn detected, clearing all memory");
    let memoryKeys = Object.keys(Memory);
    memoryKeys.forEach(key => {
        Log.w("Deleting memory key: " + key);
        (Memory as any)[key] = undefined;
    });

    //Reset systems
    resetAllSystems();
}

function init() {
    global.PLAYER_USERNAME = Game.spawns[Object.keys(Game.spawns)[0]].owner.username;
    global.INVADER_USERNAME = "Invader";
    global.KEEPER_USERNAME = "Source Keeper";

    if (!Memory.rooms) Memory.rooms = {};

    //===================================================================Initialize Systems
    Log.i("Recreating systems");
    creepManifest.initialize();
    shardSpawnSystem.scanSpawnSystems();

    //===================================================================Initialize Processes
    Log.i("Recreating process table");

    global.runner = new ProcessRunner();
    global.runner.addProcess(new SpawnProcess());
    global.runner.addProcess(new ScoutProcess());

    //===================================================================Initialize Global Functions
    global.processes = () => {
        global.runner.printProcessQueue();
    };
    global.setFeature = setFeature;
    global.toggleFeature = toggleFeature;

    global.Profiler = Profiler.init();
}

//===================================================================Main Loop
export const loop = () => {
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
            Game.cpu.generatePixel();
        }

        global.runner.runAll();

        memoryWriter.updateAll();

        //Expend all creep speech queues
        sayAll();

        // Automatically delete memory of missing creeps
        for (const name in Memory.creeps) {
            if (!(name in Game.creeps)) {
                delete Memory.creeps[name];
            }
        }
    } catch (e) {
        Log.e("Uncaught error detected", e);
    }
};
