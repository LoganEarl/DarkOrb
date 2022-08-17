export function hasRespawned() {
    // check for multiple calls on same tick
    if (Memory.respawnTick && Memory.respawnTick === Game.time) return true;

    // server reset or sim
    if (Game.time === 0) {
        Memory.respawnTick = Game.time;
        return true;
    }

    // check for 0 creeps
    if (Object.keys(Game.creeps).length) return false;

    // check for only 1 room
    var rNames = Object.keys(Game.rooms);
    if (rNames.length !== 1) return false;

    // check for controller, progress and safe mode
    var room = Game.rooms[rNames[0]];
    if (
        !room.controller ||
        !room.controller.my ||
        room.controller.level !== 1 ||
        room.controller.progress ||
        !room.controller.safeMode ||
        room.controller.safeMode !== SAFE_MODE_DURATION - 1
    )
        return false;

    // check for 1 spawn
    if (Object.keys(Game.spawns).length !== 1) return false;

    // if all cases point to a respawn, you've respawned
    Memory.respawnTick = Game.time;
    return true;
}

export function componentToHex(c: number): string {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

const vc = (c: number) => {
    if (c < 0) return 0;
    if (c > 255) return 255;
    return Math.floor(c);
};

export function rgbToHex(r: number, g: number, b: number): string {
    return "#" + componentToHex(vc(r)) + componentToHex(vc(g)) + componentToHex(vc(b));
}

export function orderOf(item: any, array: any[]): number {
    let index = array.indexOf(item);
    if (index === -1) index = array.length;
    return index;
}

let lastDrawTick = 0;
let drawCounts: { [posTag: string]: number } = {};
export function drawCircledItem(
    pos: RoomPosition,
    color: string,
    lineStyle: "dashed" | "dotted" | "solid",
    radius: number,
    text: string | undefined,
    visual: RoomVisual
) {
    if (Game.time > lastDrawTick) {
        lastDrawTick = Game.time;
        drawCounts = {};
    }
    const posTag = pos.x + " " + pos.y + " " + pos.roomName;
    let textOffset = 0;
    if (drawCounts[posTag] === undefined) drawCounts[posTag] = 0;
    else {
        textOffset = drawCounts[posTag] * 0.17;
    }

    visual.circle(pos, {
        radius: radius,
        fill: "transparent",
        lineStyle: lineStyle,
        stroke: color
    });
    if (text) {
        visual.text(text, pos.x + 0.5, pos.y - 0.5 + textOffset, {
            font: 0.15,
            align: "left",
            color: color,
            backgroundPadding: 0.01,
            backgroundColor: "black"
        });
        drawCounts[posTag] = drawCounts[posTag] + 1;
    }
}

/**
 * Compute an exponential moving average
 */
export function exponentialMovingAverage(current: number, avg: number | undefined, window: number): number {
    return (current + (avg || 0) * (window - 1)) / window;
}

/**
 * Compute an exponential moving average for unevenly spaced samples
 */
export function irregularExponentialMovingAverage(current: number, avg: number, dt: number, window: number): number {
    return (current * dt + avg * (window - dt)) / window;
}

export function getMultirooomDistance(start: RoomPosition, end: RoomPosition): number {
    if (start.roomName == end.roomName) {
        return start.getRangeTo(end);
    } else {
        const from = start.roomCoords;
        const to = end.roomCoords;
        const dx = Math.abs(50 * (to.x - from.x) + to.x - from.x);
        const dy = Math.abs(50 * (to.y - from.y) + to.y - from.y);
        return _.max([dx, dy]);
    }
}

export function initRoomPosition(pos: { x: number; y: number; roomName: string }): RoomPosition {
    return new RoomPosition(pos.x, pos.y, pos.roomName);
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(Math.min(value, max), min);
}

/**
 * Merges a list of store-like objects, summing overlapping keys. Useful for calculating assets from multiple sources
 */
export function mergeSum(objects: { [key: string]: number | undefined }[]): { [key: string]: number } {
    const ret: { [key: string]: number } = {};
    for (const object of objects) {
        for (const key in object) {
            const amount = object[key] || 0;
            if (!ret[key]) {
                ret[key] = 0;
            }
            ret[key] += amount;
        }
    }
    return ret;
}

/**
 * Equivalent to lodash.minBy() method
 */
export function minBy<T>(objects: T[], iteratee: (obj: T) => number | false): T | undefined {
    let minObj: T | undefined;
    let minVal = Infinity;
    let val: number | false;
    for (const i in objects) {
        val = iteratee(objects[i]);
        if (val !== false && val < minVal) {
            minVal = val;
            minObj = objects[i];
        }
    }
    return minObj;
}

/**
 * Equivalent to lodash.maxBy() method
 */
export function maxBy<T>(objects: T[], iteratee: (obj: T) => number | false): T | undefined {
    let maxObj: T | undefined;
    let maxVal = -Infinity;
    let val: number | false;
    for (const i in objects) {
        val = iteratee(objects[i]);
        if (val !== false && val > maxVal) {
            maxVal = val;
            maxObj = objects[i];
        }
    }
    return maxObj;
}

export function logHeapStats(): void {
    if (typeof Game.cpu.getHeapStatistics === "function") {
        const heapStats = Game.cpu.getHeapStatistics();
        const heapPercent = Math.round(
            (100 * (heapStats.total_heap_size + heapStats.externally_allocated_size)) / heapStats.heap_size_limit
        );
        const heapSize = Math.round(heapStats.total_heap_size / 1048576);
        const externalHeapSize = Math.round(heapStats.externally_allocated_size / 1048576);
        const heapLimit = Math.round(heapStats.heap_size_limit / 1048576);
        console.log(`Heap usage: ${heapSize} MB + ${externalHeapSize} MB of ${heapLimit} MB (${heapPercent}%).`);
    }
}

/**
 * Rotate a square matrix in place clockwise by 90 degrees
 */
function rotateMatrix<T>(matrix: T[][]): void {
    // reverse the rows
    matrix.reverse();
    // swap the symmetric elements
    for (let i = 0; i < matrix.length; i++) {
        for (let j = 0; j < i; j++) {
            const temp = matrix[i][j];
            matrix[i][j] = matrix[j][i];
            matrix[j][i] = temp;
        }
    }
}

/**
 * Create a shallow copy of a 2D array
 */
export function clone2DArray<T>(a: T[][]): T[][] {
    return _.map(a, e => e.slice());
}

/**
 * Return a copy of a 2D array rotated by specified number of clockwise 90 turns
 */
export function rotatedMatrix<T>(matrix: T[][], clockwiseTurns: 0 | 1 | 2 | 3): T[][] {
    const mat = clone2DArray(matrix);
    for (let i = 0; i < clockwiseTurns; i++) {
        rotateMatrix(mat);
    }
    return mat;
}

export function bodyCost(body: BodyPartConstant[]) {
    return body.reduce(function (cost, part) {
      return cost + BODYPART_COST[part];
    }, 0);
  }
