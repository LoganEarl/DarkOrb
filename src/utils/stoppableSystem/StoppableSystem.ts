abstract class StoppableSystem<V> {
    abstract loadMemory(): StoppableMemory<V>;

    abstract saveMemory(memory: StoppableMemory<V>): void;

    public addStopReason(reason: V) {
        let memory = this.loadMemory();
        if (!memory.stopReasons) memory.stopReasons = [reason];
        else memory.stopReasons.push(reason);

        if (memory.state !== "Stopped") memory.state = "Stopped";
    }
}
