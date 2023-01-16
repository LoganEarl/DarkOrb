abstract class StoppableSystem<V> {
    abstract loadMemory(): StoppableMemory<V>
    abstract saveMemory(memory: StoppableMemory<V>): void

    public addStopReason(reason: V){
        let memory = this.loadMemory()
        if(!memory.)
    }
}