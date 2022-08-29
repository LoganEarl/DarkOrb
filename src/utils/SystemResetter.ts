import { Function0 } from "lodash";

let resetFunctions: Function0<void>[] = [];
export function registerResetFunction(resetter: Function0<void>): void {
    resetFunctions.push(resetter);
}

export function resetAllSystems() {
    resetFunctions.forEach(f => f());
}
