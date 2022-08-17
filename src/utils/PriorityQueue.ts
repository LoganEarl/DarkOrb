/**
 * Puts the T in PriorityQueue<T>
 */
export interface PriorityQueueItem {
    queueIndex: number
}

export type Comparator<T> = (a: T, b: T) => number

/**
 * Priority Queue built on an array-backed binary heap supporting O(1) contains
 * Item must have writeable property queueIndex: number
 */
export class PriorityQueue<T extends PriorityQueueItem> {
    public items: T[]
    private _comparator: Comparator<T>
    private _length: number

    public constructor(capacity: number, comparator: Comparator<T>, items?: T[]) {
        this.items = items ?? new Array<T>(capacity)
        this._comparator = comparator
        this._length = 0
    }

    public clone(): PriorityQueue<T> {
        let newQueue = new PriorityQueue<T>(this.capacity, this._comparator, this.items.slice())
        newQueue._length = this.length
        return newQueue
    }

    public set comparator(comparator: Comparator<T>) {
        let newQueue = new PriorityQueue<T>(this.capacity, comparator)
        newQueue.enqueueAll(this.items)
        this._comparator = comparator
        this.items = newQueue.items
    }

    public get length(): number {
        return this._length
    }

    public get capacity(): number {
        return this.items.length
    }

    public enqueueAll(items: T[]): void {
        Object.values(items).forEach(item => this.enqueue(item))
    }

    public enqueue(item: T): void {
        const index = this._length++
        this.items[index] = item
        this.heapUp(index)
    }

    public dequeue(): T | undefined {
        if (this.length === 0) return undefined
        const item = this.items[0] // get our item
        // bring last to first
        this.items[0] = this.items[--this._length]
        this.items[0].queueIndex = 0
        // and find out where it belongs
        this.heapDown(0)
        return item
    }

    public remove(item: T): void {
        let shifting = false
        for (let i = 0; i < this._length; i++) {
            if (shifting) {
                this.items[i - 1] = this.items[i]
            } else if (item === this.items[i]) {
                shifting = true
                delete this.items[i]
            }
        }
        this._length--
    }

    //remove all items after the given item. Return the removed items
    public truncateAfter(item: T): T[] {
        let truncated: T[] = []
        let index = -1
        for (let i = 0; i < this._length; i++) {
            if (index > -1) {
                truncated.push(this.items[i])
                delete this.items[i]
            } else if (item === this.items[i]) {
                index = i + 1
            }
        }
        this._length = index
        return truncated
    }

    public peek(): T | undefined {
        if (this.length === 0) return undefined
        return this.items[0]
    }

    public contains(item: T): boolean {
        if (item.queueIndex < 0 || item.queueIndex >= this.length) return false
        return this.items[item.queueIndex] === item
    }

    public clear(fill?: boolean): void {
        this._length = 0
        if (fill === true) {
            const capacity = this.capacity
            this.items.length = 0
            this.items.length = capacity
        }
    }

    private parent(index: number): number {
        return Math.trunc((index - 1) / 2)
    }

    private left(index: number): number {
        return index * 2 + 1
    }

    private heapUp(index: number): void {
        // move items up the heap
        const item = this.items[index]
        // find the first place we are not smaller than our parent
        while (index > 0) {
            const p = this.parent(index)
            const result = this._comparator(item, this.items[p])
            if (result > 0) {
                // larger than parent - this is our stop
                break
            }
            // smaller than parent, so we trade places with it
            this.items[index] = this.items[p]
            this.items[index].queueIndex = index
            index = p
        }
        // found our index and our home
        this.items[index] = item
        item.queueIndex = index
    }
    
    private heapDown(index: number): void {
        // move item down until they are not larger than their smallest child
        const item = this.items[index]
        while (index < this.length) {
            const l = this.left(index)
            if (l >= this.length) break // we reached the end, this is our stop
            const r = l + 1
            const c = r >= this.length ? l : this._comparator(this.items[l], this.items[r]) <= 0 ? l : r // get the index of the smallest available child
            const child = this.items[c]
            const result = this._comparator(item, child)
            if (result <= 0) {
                break // we are not larger than our smallest child, this is our stop
            }
            this.items[index] = child
            child.queueIndex = index
            index = c
        }
        // found our index and our home
        this.items[index] = item
        item.queueIndex = index
    }
}
