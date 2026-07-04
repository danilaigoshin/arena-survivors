export interface Poolable {
  active: boolean;
}

/** Fixed-capacity pool. Iterate items[0..count) — dense, active entries only. */
export class Pool<T extends Poolable> {
  items: T[];
  count = 0;

  constructor(capacity: number, factory: () => T) {
    this.items = new Array(capacity);
    for (let i = 0; i < capacity; i++) this.items[i] = factory();
  }

  /** Returns a slot or null if the pool is full. */
  alloc(): T | null {
    if (this.count >= this.items.length) return null;
    const item = this.items[this.count++];
    item.active = true;
    return item;
  }

  /** Frees by swap-with-last; safe inside a manual backward loop, or use sweep(). */
  free(index: number): void {
    const last = this.count - 1;
    const item = this.items[index];
    item.active = false;
    if (index !== last) {
      this.items[index] = this.items[last];
      this.items[last] = item;
    }
    this.count = last;
  }

  /** Removes all items with active=false. Call once after marking deaths. */
  sweep(): void {
    for (let i = this.count - 1; i >= 0; i--) {
      if (!this.items[i].active) {
        const last = this.count - 1;
        const item = this.items[i];
        if (i !== last) {
          this.items[i] = this.items[last];
          this.items[last] = item;
        }
        this.count = last;
      }
    }
  }

  clear(): void {
    for (let i = 0; i < this.count; i++) this.items[i].active = false;
    this.count = 0;
  }
}
