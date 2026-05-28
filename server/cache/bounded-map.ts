/**
 * BoundedMap — Drop-in replacement for Map<string, T> with LRU eviction and TTL.
 * 
 * Solves the unbounded growth problem in services that use plain Map() for state.
 * Has the same API as Map (get, set, has, delete, clear, size, keys, values, entries, forEach).
 * Backed by lru-cache for automatic eviction.
 * 
 * Usage: Replace `new Map()` with `new BoundedMap(1000, 3600_000)` (max 1000 items, 1h TTL)
 */

import { LRUCache } from 'lru-cache';

export class BoundedMap<K extends string | number, V extends {}> implements Iterable<[string, V]> {
  private cache: LRUCache<string, V>;

  constructor(maxEntries: number = 1000, ttlMs: number = 3600_000) {
    this.cache = new LRUCache<string, V>({
      max: maxEntries,
      ttl: ttlMs,
      updateAgeOnGet: true,
    });
  }

  private toKey(key: K): string {
    return String(key);
  }

  get(key: K): V | undefined {
    return this.cache.get(this.toKey(key));
  }

  set(key: K, value: V): this {
    this.cache.set(this.toKey(key), value);
    return this;
  }

  has(key: K): boolean {
    return this.cache.has(this.toKey(key));
  }

  delete(key: K): boolean {
    return this.cache.delete(this.toKey(key));
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }

  *entries(): IterableIterator<[string, V]> {
    for (const key of this.cache.keys()) {
      const val = this.cache.get(key);
      if (val !== undefined) {
        yield [key, val];
      }
    }
  }

  [Symbol.iterator](): Iterator<[string, V]> {
    return this.entries();
  }

  forEach(callbackfn: (value: V, key: string, map: BoundedMap<K, V>) => void): void {
    for (const [key, value] of this.entries()) {
      callbackfn(value, key, this);
    }
  }
}
