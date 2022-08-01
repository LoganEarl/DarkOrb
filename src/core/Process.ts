import { PriorityQueueItem } from "utils/PriorityQueue";

export abstract class Process implements PriorityQueueItem {
    public priority: number;
    public estimatedCpuCost: number = 0;
    public processId: string;
    public queueIndex = 0;
    public suspendedUntil = 0;
    abstract processType: string;
    ran: boolean = false;

    private cpuHistory: number[] = [];
    private currentCpuSlot: number = 0;

    constructor(processId: string, priority: number) {
        this.priority = priority;
        this.processId = processId;
    }

    preRunProcess(): void {
        let cpuBefore = Game.cpu.getUsed();
        if (this.suspendedUntil <= Game.time && this.preRun) this.preRun();
        let cpuUsed = Game.cpu.getUsed() - cpuBefore;

        if (this.cpuHistory.length < 100) {
            this.cpuHistory.push(cpuUsed);
            this.currentCpuSlot = this.cpuHistory.length - 1;
        } else {
            this.currentCpuSlot = Game.time % 100;
            this.cpuHistory[this.currentCpuSlot] = cpuUsed;
        }
    }

    runProcess(): void {
        let cpuBefore = Game.cpu.getUsed();
        if (this.suspendedUntil <= Game.time) this.run();
        let cpuUsed = Game.cpu.getUsed() - cpuBefore;
        this.cpuHistory[this.currentCpuSlot] += cpuUsed;
    }

    postRunProcess(): void {
        let cpuBefore = Game.cpu.getUsed();
        if (this.suspendedUntil <= Game.time && this.postRun) this.postRun();
        let cpuUsed = Game.cpu.getUsed() - cpuBefore;
        this.cpuHistory[this.currentCpuSlot] += cpuUsed;
    }

    preRun?(): void;
    postRun?(): void;

    abstract run(): void;
    onCancel?(): void;

    public averageCpuUsage(): number {
        var sum = this.cpuHistory.reduce(function (sum, value) {
            return sum + value;
        }, 0);

        return sum / this.cpuHistory.length;
    }

    public lastCpuUsage(): number {
        if (this.cpuHistory.length < 100) return this.cpuHistory[this.cpuHistory.length - 1];
        return this.cpuHistory[Game.time & 100];
    }
}

export abstract class RoomProcess extends Process {
    public roomName: string;

    constructor(processId: string, roomName: string, priority: number) {
        super(processId, priority);
        this.roomName = roomName;
    }

    abstract run(): void;
}

export abstract class FlagProcess extends Process {
    public flagName: string;

    constructor(processId: string, flagName: string, priority: number) {
        super(processId, priority);
        this.flagName = flagName;
    }

    abstract run(): void;
}
