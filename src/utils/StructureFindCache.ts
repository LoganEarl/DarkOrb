//For multiple checks on the same tick
var gameObjectCache: { [lookupKey: string]: Structure[] } = {};
var lastCheckTick = 0;

//Cache ids for 20 ticks for optimized lookups later
const ID_CACHE_TTL = 20;
var objectIdCache: { [lookupKey: string]: StructureIdCache } = {};

class StructureIdCache {
    public ids: Id<Structure>[];
    public ttl: number;

    constructor(ids: Id<Structure>[]) {
        this.ids = ids;
        this.ttl = Game.time + ID_CACHE_TTL;
    }
}

type FindStructure = FIND_STRUCTURES | FIND_MY_SPAWNS | FIND_MY_STRUCTURES | FIND_HOSTILE_STRUCTURES;

export function findStructure(room: Room | undefined, find: FindStructure): Structure[] {
    if (!room) return [];

    let lookupKey = room.name + "|" + find;

    if (Game.time != lastCheckTick) gameObjectCache = {};

    if (Game.time == lastCheckTick && gameObjectCache[lookupKey]) {
        return gameObjectCache[lookupKey];
    }
    lastCheckTick = Game.time;

    let idCache = objectIdCache[lookupKey];
    if (idCache && idCache.ttl > Game.time) {
        let result: Structure[] = idCache.ids
            .map(id => Game.getObjectById(id))
            .filter(s => s)
            .map(s => s!); //We already filtered the bad results out
        gameObjectCache[lookupKey] = result;
        return result;
    } else if (idCache) {
        delete objectIdCache[lookupKey];
    }

    let result = room.find(find);
    gameObjectCache[lookupKey] = result;
    objectIdCache[lookupKey] = new StructureIdCache(result.map(s => s.id));
    return result;
}
