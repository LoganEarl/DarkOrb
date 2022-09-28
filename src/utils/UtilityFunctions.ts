import { Log } from "./logger/Logger";
import { findStructure } from "./StructureFindCache";

export function hasRespawned() {
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
    Log.d(room?.controller?.safeMode + "");
    if (
        !room.controller ||
        !room.controller.my ||
        room.controller.level !== 1 ||
        room.controller.progress ||
        !room.controller.safeMode ||
        (room.controller.safeMode < SAFE_MODE_DURATION - 1 && (Memory.respawnTick ?? 0) < Game.time - 2)
    ) {
        return false;
    }
    // check for 1 spawn
    if (Object.keys(Game.spawns).length !== 1) return false;
    // if all cases point to a respawn, you've respawned
    Memory.respawnTick = Game.time;
    return true;
}

export function samePos(pos1: RoomPosition, pos2: RoomPosition): boolean {
    return pos1.x === pos2.x && pos1.y === pos2.y && pos1.roomName === pos2.roomName;
}

export function getFreeSpacesNextTo(pos: RoomPosition, room?: Room): RoomPosition[] {
    const terrain = Game.map.getRoomTerrain(pos.roomName);

    let obsticles = room ? findStructure(room, FIND_STRUCTURES).filter(s => !s.isWalkable && s.pos.isNearTo(pos)) : [];

    let freeSpots: RoomPosition[] = [];
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            if (x !== 0 || y !== 0) {
                let structureBlocks =
                    obsticles.length && _.any(obsticles, s => s.pos.x === pos.x + x && s.pos.y === pos.y + y);

                if (!structureBlocks && terrain.get(pos.x + x, pos.y + y) !== TERRAIN_MASK_WALL) {
                    freeSpots.push(new RoomPosition(pos.x + x, pos.y + y, pos.roomName));
                }
            }
        }
    }

    freeSpots.sort((a, b) => {
        let result = a.x - b.x;
        if (result !== 0) return result;
        result = a.y - b.y;
        return result;
    });
    return freeSpots;
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

export function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgbToHex(255 * f(0), 255 * f(8), 255 * f(4));
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

export function drawBar(
    text: string,
    verticalIndex: number,
    completion: number,
    visual: RoomVisual,
    backColor: string = "blue"
) {
    completion = clamp(completion, 0, 1);
    let width = 10;
    visual.rect(49 - width, verticalIndex, width, 0.8, {
        fill: "black"
    });
    visual.rect(49 - width * completion, verticalIndex, width * completion, 0.8, {
        fill: backColor
    });
    visual.text(text, 48.8, verticalIndex + 0.6, {
        color: "gray",
        font: 0.6,
        align: "right",
        fontFamily: "Courier New"
    });
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

export function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
    return _.max([Math.abs(x1 - x2), Math.abs(y1 - y2)]);
}

export function roomPos(coord: Coord, roomName: string) {
    return new RoomPosition(coord.x, coord.y, roomName);
}

export function roomNameFromCoord(roomCoord: Coord) {
    let x = roomCoord.x;
    let y = roomCoord.y;

    let c1 = x;
    let c2 = y;
    if (x < 0) c1 = -1 * (c1 + 1);
    if (y < 0) c2 = -1 * (c2 + 1);

    let ns = y < 0 ? "N" : "S";
    let ew = x < 0 ? "W" : "E";

    return ns + c2 + ew + c1;
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
export function rotateMatrix<T>(matrix: T[][]): void {
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

export function isWalkableOwnedRoom(type: StructureConstant): boolean {
    return type == STRUCTURE_ROAD || type == STRUCTURE_CONTAINER || type == STRUCTURE_RAMPART;
}

/**
 * Create a shallow copy of a 2D array
 */
export function clone2DArray<T>(a: T[][]): T[][] {
    return _.map(a, e => e.slice());
}

/**
 * Rotate the given matrix the given number of times
 */
export function rotateMatrixTurns<T>(matrix: T[][], clockwiseTurns: 0 | 1 | 2 | 3): void {
    for (let i = 0; i < clockwiseTurns; i++) {
        rotateMatrix(matrix);
    }
}

export function findPositionsInsideRect(x1: number, y1: number, x2: number, y2: number): Coord[] {
    const positions: Coord[] = [];

    for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
            // Iterate if the pos doesn't map onto a room
            if (x < 0 || x >= 50 || y < 0 || y >= 50) continue;

            // Otherwise pass the x and y to positions
            positions.push({ x, y });
        }
    }

    return positions;
}
