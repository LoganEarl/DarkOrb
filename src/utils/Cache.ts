export class Cache<T> {
    private cachedResult?: T
    private lastLookup?: number
    private ttl: number
    private lookup: () => T
    
    constructor(ttl: number, lookup: () => T) {
        this.ttl = ttl
        this.lookup = lookup
    }

    public get(): T {
        if(this.cachedResult != undefined && (this.lastLookup ?? (this.ttl * -2)) + this.ttl > Game.time) {
            return this.cachedResult
        }
        this.cachedResult = this.lookup()
        this.lastLookup = Game.time
        return this.cachedResult
    }
}