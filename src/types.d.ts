// example declaration file - remove these and add your own custom typings
import { ProcessRunner } from "core/ProcessRunner";

type MainStorageStructure = StructureStorage | StructureContainer | StructureSpawn;

// memory extension samples
declare global {
    interface RoomMemory {}

    interface Memory {
        profiler: ProfilerMemory;
        noSeason?: boolean;
        season1?: boolean;
        season2?: boolean;
        featureToggles?: { [feature: string]: boolean };
        respawnTick?: number;
    }

    interface ProfilerMemory {
        data: { [name: string]: ProfilerData };
        start?: number;
        total: number;
    }

    interface ProfilerData {
        calls: number;
        time: number;
    }

    interface Profiler {
        clear(): void;
        output(): void;
        start(): void;
        status(): void;
        stop(): void;
        toString(): string;
    }

    namespace NodeJS {
        interface Global {
            PLAYER_USERNAME: string;
            INVADER_USERNAME: string;
            KEEPER_USERNAME: string;
            runner: ProcessRunner;
            Profiler: Profiler;
            processes: () => void;
            setFeature: (feature: string, enabled: boolean) => void;
            toggleFeature: (feature: string) => boolean;
        }
    }
}
