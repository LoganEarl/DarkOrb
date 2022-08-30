// example declaration file - remove these and add your own custom typings
import { ProcessRunner } from "core/ProcessRunner";

type MainStorageStructure = StructureStorage | StructureContainer | StructureSpawn;

// memory extension samples
declare global {
    interface RoomMemory {}

    interface Memory {
        noSeason?: boolean;
        season1?: boolean;
        season2?: boolean;
        featureToggles?: { [feature: string]: boolean };
        respawnTick?: number;
    }

    namespace NodeJS {
        interface Global {
            PLAYER_USERNAME: string;
            INVADER_USERNAME: string;
            KEEPER_USERNAME: string;
            Profiler: Profiler;
            runner: ProcessRunner;
            processes: () => void;
            setFeature: (feature: string, enabled: boolean) => void;
            toggleFeature: (feature: string) => boolean;
        }
    }
}
