import {parseStructures} from "./StampLogic";

export const EXTENSION_POD_JSON: string[] = [
    //Can't build until rcl 3
    `{"name":"","shard":"","rcl":3,"buildings":{"road":{"pos":[{"x":1,"y":1},{"x":0,"y":2},{"x":1,"y":3},{"x":2,"y":4},{"x":3,"y":3},{"x":4,"y":2},{"x":3,"y":1},{"x":2,"y":0}]},"extension":{"pos":[{"x":2,"y":1},{"x":2,"y":2},{"x":2,"y":3},{"x":3,"y":2},{"x":1,"y":2}]}}}`
];

export const EXTENSION_GROUP = parseStructures(EXTENSION_POD_JSON);
