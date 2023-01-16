type StoppableSystemState = "New" | "Running" | "Stopped";

interface StateChangeEvent<V> {
    prevState: StoppableSystemState;
    newState: StoppableSystemState;
    addedStopReason?: V;
    removedStopReason?: V;
}

interface StoppableMemory<V> {
    state: StoppableSystemState;
    stopReasons: V[];
    stateHistory: StateChangeEvent<V>;
}
