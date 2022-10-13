import { Log } from "utils/logger/Logger";

export function memhack(fn: () => void) {
    let memory: Memory;
    let tick: number;

    return () => {
        let cpu = Game.cpu.getUsed();
        if (tick && tick + 1 === Game.time && memory) {
            // this line is required to disable the default Memory deserialization
            delete global.Memory;
            global.Memory = memory;
        } else {
            memory = Memory;
        }

        tick = Game.time;

        fn();

        // there are two ways of saving Memory with different advantages and disadvantages
        // 1. RawMemory.set(JSON.stringify(Memory));
        // + ability to use custom serialization method
        // - you have to pay for serialization
        // - unable to edit Memory via Memory watcher or console
        // 2. RawMemory._parsed = Memory;
        // - undocumented functionality, could get removed at any time
        // + the server will take care of serialization, it doesn't cost any CPU on your site
        // + maintain full functionality including Memory watcher and console

        // this implementation uses the official way of saving Memory
        // RawMemory.set(JSON.stringify(Memory));

        if (Game.time % 10 === 0) {
            RawMemory.set(JSON.stringify(Memory));
        } else {
            delete RawMemory._parsed;
        }

        // RawMemory._parsed = Memory;

        Log.d(`Used before tick ${cpu} After:${Game.cpu.getUsed()} Bucket:${Game.cpu.bucket}`);
    };
}
