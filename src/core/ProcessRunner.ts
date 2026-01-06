import {Process} from "./Process";
import {PriorityQueue} from "utils/PriorityQueue";
import {Log} from "utils/logger/Logger";

export class ProcessRunner {
    private compare: (a: any, b: any) => number;
    private toRunThisTick: PriorityQueue<Process>;
    private toRunNextTick: PriorityQueue<Process>;
    private allProcesses: Process[] = [];
    private processIds: Set<string> = new Set();
    private toDelete: Process[] = [];

    constructor() {
        this.compare = (a, b) => a.priority - b.priority;
        this.toRunThisTick = new PriorityQueue(100, this.compare);
        this.toRunNextTick = new PriorityQueue(100, this.compare);
    }

    //TODO do more than blindly run everything
    runAll(): void {
        Object.values(this.allProcesses).forEach(process => {
            try {
                process.preRunProcess();
            } catch (error) {
                Log.e("Error in prerun of PID:" + process.processId, error);
            }
        });

        while (this.toRunThisTick.length > 0) {
            let process = this.toRunThisTick.dequeue()!;
            let shouldDelete = this.toDelete.includes(process!);
            if (shouldDelete && process?.onCancel) {
                try {
                    process?.onCancel();
                } catch (error) {
                    Log.e("Error in cancelation of PID:" + process.processId, error);
                }
            } else if (!shouldDelete) {
                try {
                    process?.runProcess();
                } catch (error) {
                    Log.e("Error in run of PID:" + process?.processId, error);
                }
                if (process && !this.toDelete.includes(process!)) {
                    this.toRunNextTick.enqueue(process);
                }
            }
        }

        Object.values(this.allProcesses).forEach(process => {
            try {
                process.postRunProcess();
            } catch (error) {
                Log.e("Error in postRun of PID:" + process.processId, error);
            }
        });

        let swap = this.toRunNextTick;
        this.toRunNextTick = this.toRunThisTick;
        this.toRunThisTick = swap;
        this.toDelete = [];
    }

    public printProcessQueue() {
        let output = "\nProcess Usage:\n";

        let totalUsage = 0;
        let usageByClass: { [className: string]: number } = {};
        this.allProcesses.forEach(process => {
            let type = process.processType;
            if (!usageByClass[type]) usageByClass[type] = 0;
            let usage = process.averageCpuUsage();
            usageByClass[type] += usage;
            totalUsage += usage;
        });
        totalUsage = Math.floor(totalUsage * 100) / 100;

        output += `\n${ProcessRunner.padString("Class", 40)} ${ProcessRunner.padString(
            "CPU",
            5
        )} ${ProcessRunner.padString("%", 5)}}`;
        Object.keys(usageByClass).forEach(key => {
            output += `\n${ProcessRunner.padString(key, 40)} ${ProcessRunner.padString(
                String(Math.floor(usageByClass[key] * 100) / 100),
                5
            )} ${ProcessRunner.padString(String(Math.ceil((usageByClass[key] * 100) / totalUsage)), 5)}%`;
        });

        output += `\nProcess Queue\n${ProcessRunner.padString("PID", 40)} ${ProcessRunner.padString(
            "Priority",
            10
        )} ${ProcessRunner.padString("CPU", 5)} ${ProcessRunner.padString("%", 5)}`;
        this.allProcesses.forEach(process => {
            let usage = Math.floor(process.averageCpuUsage() * 100) / 100;
            output += `\n${ProcessRunner.padString(process.processId, 40)} ${ProcessRunner.padString(
                String(process.priority),
                10
            )} ${ProcessRunner.padString(String(usage), 5)} ${ProcessRunner.padString(
                String(Math.ceil((usage * 100) / totalUsage)),
                5
            )}%`;
        });

        Log.i(output);
    }

    private static padString(value: string, width: number): string {
        let pad = "";
        for (let i = 0; i < width; i++) pad += " ";

        return String(pad + value).slice(-1 * width);
    }

    addProcess(process: Process) {
        // Log.i(`Added process: ${JSON.stringify(process)}`);
        if (!this.processIds.has(process.processId)) {
            this.allProcesses.push(process);
            this.processIds.add(process.processId);
            this.toRunThisTick.enqueue(process);
            if (process.preRun) process.preRun();
        }
    }

    deleteProcess(process: Process) {
        if (!this.toDelete.includes(process) && this.processIds.has(process.processId)) {
            this.toDelete.push(process);
            this.processIds.delete(process.processId);
            this.allProcesses.splice(this.allProcesses.indexOf(process), 1);
        }
    }

    getProcess(processId: string): Process | null {
        if (!this.processIds.has(processId)) return null;

        for (let process of this.allProcesses) if (process.processId === processId) return process;
        return null;
    }

    processQueueLength(): number {
        return this.allProcesses.length;
    }
}
