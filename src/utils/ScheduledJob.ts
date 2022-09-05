var nextSeed = 0;
export class ScheduledJob {
    private job: () => void;
    private seed: number;
    private period: number;

    constructor(job: () => void, context: any, period: number) {
        this.job = job.bind(context);
        this.seed = nextSeed;
        nextSeed = (nextSeed + 1) % 500;
        this.period = period;
    }

    public run() {
        if ((Game.time + this.seed) % this.period === 0) this.job();
    }
}
