import { ErrorMapper } from "utils/ErrorMapper";
import { ProcessRunner } from "core/ProcessRunner";
import * as Profiler from "utils/profiler/Profiler";
import { sayAll } from "model/Creep";
import './model/RoomPosition';
import './model/Structures';
import './model/Creep';
import { hasRespawned } from "utils/UtilityFunctions";
import { setFeature, toggleFeature } from "utils/featureToggles/FeatureToggles";

const BUILD_NUMBER = 10

let deferedInit = false
let waitingForRespawn = false
let globalRefresh = true

console.log(`Global refresh detected, recreating process table: Build: ${BUILD_NUMBER}`);

function init() {
  global.PLAYER_USERNAME = Game.spawns[Object.keys(Game.spawns)[0]].owner.username
  global.INVADER_USERNAME = "Invader"

  if(!Memory.rooms) Memory.rooms = {}

  console.log("Recreating process table")
  //===================================================================Initialize Processes

  global.runner = new ProcessRunner()

//===================================================================Initialize Global Functions
  global.processes = () => {
    global.runner.printProcessQueue()
  }
  global.setFeature = setFeature
  global.toggleFeature = toggleFeature

  global.Profiler = Profiler.init();
}

//===================================================================Main Loop
export const loop = ErrorMapper.wrapLoop(() => {
  try{
    let detectedRespawn = hasRespawned()
    //If we have respawned make sure to reinit all our processes
    if((globalRefresh || (!detectedRespawn && waitingForRespawn)) && !deferedInit){
      globalRefresh = false
      if (!Game.cpu.bucket || Game.cpu.bucket > 500){
        waitingForRespawn = false
        init()
      }else
        deferedInit = true
    }

    waitingForRespawn = detectedRespawn

    //If we are waiting to have enough bucket to start up
    if (deferedInit) {
      if (!Game.cpu.bucket || Game.cpu.bucket > 500 ) {
        deferedInit = false
        init()
      } else {
        console.log("Defering code init")
        // exportStats()
        return
      }
    }

    if (Game.cpu.bucket === 10000) {
      Game.cpu.generatePixel();
    }

    global.runner.runAll()

    //Expend all creep speech queues
    sayAll()

    // Automatically delete memory of missing creeps
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        delete Memory.creeps[name];
      }
    }

  }catch(e){
    console.log((e as Error).stack)
  }
});
