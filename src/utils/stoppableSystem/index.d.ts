type StoppableSystemState = "New" | "Running" | "Stopped";

interface StoppableMemory<V> {
    state: StoppableSystemState;
    stopReasons: V[];
}
