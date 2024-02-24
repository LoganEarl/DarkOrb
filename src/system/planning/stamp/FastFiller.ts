import {parseStructures} from "./StampLogic";

export const FAST_FILLER_JSON: string[] = [
    `{"name":"","shard":"","rcl":1,"buildings":{"spawn":{"pos":[{"x":1,"y":3}]}}}`,
    `{"name":"","shard":"","rcl":2,"buildings":{"spawn":{"pos":[{"x":1,"y":3}]},"extension":{"pos":[{"x":1,"y":2},{"x":1,"y":1},{"x":2,"y":1},{"x":2,"y":3},{"x":3,"y":3}]},"container":{"pos":[{"x":3,"y":1}]}}}`,
    `{"name":"","shard":"","rcl":3,"buildings":{"spawn":{"pos":[{"x":1,"y":3}]},"extension":{"pos":[{"x":1,"y":2},{"x":1,"y":1},{"x":2,"y":1},{"x":2,"y":3},{"x":3,"y":3},{"x":1,"y":4},{"x":1,"y":5},{"x":2,"y":5},{"x":3,"y":4},{"x":3,"y":2}]},"container":{"pos":[{"x":3,"y":1},{"x":3,"y":5}]},"road":{"pos":[{"x":0,"y":5},{"x":0,"y":4},{"x":0,"y":3},{"x":0,"y":2},{"x":0,"y":1},{"x":1,"y":0},{"x":2,"y":0},{"x":3,"y":0},{"x":4,"y":0},{"x":5,"y":0},{"x":6,"y":1},{"x":6,"y":2},{"x":6,"y":3},{"x":6,"y":4},{"x":6,"y":5},{"x":5,"y":6},{"x":4,"y":6},{"x":2,"y":6},{"x":1,"y":6},{"x":3,"y":6},{"x":2,"y":4},{"x":3,"y":5},{"x":3,"y":1},{"x":2,"y":2},{"x":4,"y":2},{"x":4,"y":4}]}}}`,
    `{"name":"","shard":"","rcl":4,"buildings":{"spawn":{"pos":[{"x":1,"y":3}]},"extension":{"pos":[{"x":1,"y":2},{"x":1,"y":1},{"x":2,"y":1},{"x":2,"y":3},{"x":3,"y":3},{"x":1,"y":4},{"x":1,"y":5},{"x":2,"y":5},{"x":3,"y":4},{"x":3,"y":2},{"x":4,"y":3},{"x":5,"y":2},{"x":5,"y":1},{"x":4,"y":1},{"x":5,"y":4},{"x":5,"y":5},{"x":4,"y":5}]},"container":{"pos":[{"x":3,"y":1},{"x":3,"y":5}]},"road":{"pos":[{"x":0,"y":5},{"x":0,"y":4},{"x":0,"y":3},{"x":0,"y":2},{"x":0,"y":1},{"x":1,"y":0},{"x":2,"y":0},{"x":3,"y":0},{"x":4,"y":0},{"x":5,"y":0},{"x":6,"y":1},{"x":6,"y":2},{"x":6,"y":3},{"x":6,"y":4},{"x":6,"y":5},{"x":5,"y":6},{"x":4,"y":6},{"x":2,"y":6},{"x":1,"y":6},{"x":3,"y":6},{"x":4,"y":4},{"x":4,"y":2},{"x":2,"y":2},{"x":2,"y":4},{"x":3,"y":5},{"x":3,"y":1}]}}}`,
    `{"name":"","shard":"","rcl":5,"buildings":{"spawn":{"pos":[{"x":1,"y":3}]},"extension":{"pos":[{"x":1,"y":2},{"x":1,"y":1},{"x":2,"y":1},{"x":2,"y":3},{"x":1,"y":4},{"x":1,"y":5},{"x":2,"y":5},{"x":3,"y":4},{"x":3,"y":2},{"x":4,"y":3},{"x":5,"y":2},{"x":5,"y":1},{"x":4,"y":1},{"x":5,"y":4},{"x":5,"y":5},{"x":4,"y":5}]},"container":{"pos":[{"x":3,"y":1},{"x":3,"y":5}]},"road":{"pos":[{"x":0,"y":5},{"x":0,"y":4},{"x":0,"y":3},{"x":0,"y":2},{"x":0,"y":1},{"x":1,"y":0},{"x":2,"y":0},{"x":3,"y":0},{"x":4,"y":0},{"x":5,"y":0},{"x":6,"y":1},{"x":6,"y":2},{"x":6,"y":3},{"x":6,"y":4},{"x":6,"y":5},{"x":5,"y":6},{"x":4,"y":6},{"x":2,"y":6},{"x":1,"y":6},{"x":3,"y":6},{"x":3,"y":1},{"x":2,"y":2},{"x":4,"y":2},{"x":4,"y":4},{"x":2,"y":4},{"x":3,"y":5}]},"link":{"pos":[{"x":3,"y":3}]}}}`,
    `{"name":"","shard":"","rcl":6,"buildings":{"spawn":{"pos":[{"x":1,"y":3}]},"extension":{"pos":[{"x":1,"y":2},{"x":1,"y":1},{"x":2,"y":1},{"x":2,"y":3},{"x":1,"y":4},{"x":1,"y":5},{"x":2,"y":5},{"x":3,"y":4},{"x":3,"y":2},{"x":4,"y":3},{"x":5,"y":2},{"x":5,"y":1},{"x":4,"y":1},{"x":5,"y":4},{"x":5,"y":5},{"x":4,"y":5}]},"road":{"pos":[{"x":0,"y":5},{"x":0,"y":4},{"x":0,"y":3},{"x":0,"y":2},{"x":0,"y":1},{"x":1,"y":0},{"x":2,"y":0},{"x":3,"y":0},{"x":4,"y":0},{"x":5,"y":0},{"x":6,"y":1},{"x":6,"y":2},{"x":6,"y":3},{"x":6,"y":4},{"x":6,"y":5},{"x":5,"y":6},{"x":4,"y":6},{"x":2,"y":6},{"x":1,"y":6},{"x":3,"y":6},{"x":4,"y":4},{"x":2,"y":4},{"x":3,"y":5},{"x":2,"y":2},{"x":4,"y":2},{"x":3,"y":1}]},"link":{"pos":[{"x":3,"y":3}]},"container":{"pos":[{"x":3,"y":1},{"x":3,"y":5}]}}}`,
    `{"name":"","shard":"","rcl":7,"buildings":{"spawn":{"pos":[{"x":1,"y":3},{"x":5,"y":3}]},"extension":{"pos":[{"x":1,"y":2},{"x":1,"y":1},{"x":2,"y":1},{"x":2,"y":3},{"x":1,"y":4},{"x":1,"y":5},{"x":2,"y":5},{"x":3,"y":4},{"x":3,"y":2},{"x":4,"y":3},{"x":5,"y":2},{"x":5,"y":1},{"x":4,"y":1},{"x":5,"y":4},{"x":5,"y":5},{"x":4,"y":5}]},"road":{"pos":[{"x":0,"y":5},{"x":0,"y":4},{"x":0,"y":3},{"x":0,"y":2},{"x":0,"y":1},{"x":1,"y":0},{"x":2,"y":0},{"x":4,"y":0},{"x":5,"y":0},{"x":6,"y":1},{"x":6,"y":2},{"x":6,"y":3},{"x":6,"y":4},{"x":6,"y":5},{"x":5,"y":6},{"x":4,"y":6},{"x":2,"y":6},{"x":1,"y":6},{"x":4,"y":2},{"x":2,"y":2},{"x":3,"y":1},{"x":3,"y":5},{"x":4,"y":4},{"x":2,"y":4},{"x":3,"y":6},{"x":3,"y":0}]},"link":{"pos":[{"x":3,"y":3}]},"container":{"pos":[{"x":3,"y":5},{"x":3,"y":1}]}}}`
];

//relative to the upper left
export const FAST_FILLER_SPAWN_COORDS: [Coord, Coord] = [
    {x: 1, y: 3},
    {x: 5, y: 3}
];

export const FAST_FILLER_CONTAINER_COORDS: [Coord, Coord] = [
    {x: 3, y: 1},
    {x: 3, y: 5}
];

export const FAST_FILLER_STANDING_POSITIONS: [Coord, Coord, Coord, Coord] = [
    {x: 2, y: 2},
    {x: 4, y: 2},
    {x: 2, y: 4},
    {x: 4, y: 4}
];

export const FAST_FILLER_GROUP = parseStructures(FAST_FILLER_JSON);
