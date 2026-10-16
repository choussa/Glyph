/**
 * A byte-budgeted LRU cache.
 *
 * Render artifacts are binary blobs whose sizes vary by three orders of
 * magnitude, so an entry-count bound is the wrong knob — this one evicts by
 * total bytes and keeps a secondary entry cap so a flood of tiny entries
 * cannot grow the map unbounded.
 */
export class ByteLruCache<V> {
  readonly #entries = new Map<string, { value: V; size: number }>();
  readonly #maxBytes: number;
  readonly #maxEntries: number;
  #bytes = 0;
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(maxBytes: number, maxEntries: number) {
    this.#maxBytes = maxBytes;
    this.#maxEntries = maxEntries;
  }

  get(key: string): V | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      this.#misses++;
      return undefined;
    }
    // Refresh recency: delete + set moves it to the tail of the Map.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    this.#hits++;
    return entry.value;
  }

  has(key: string): boolean {
    return this.#entries.has(key);
  }

  set(key: string, value: V, size: number): void {
    if (size > this.#maxBytes) return; // never let one blob evict everything
    const existing = this.#entries.get(key);
    if (existing !== undefined) {
      this.#bytes -= existing.size;
      this.#entries.delete(key);
    }
    this.#entries.set(key, { value, size });
    this.#bytes += size;
    this.#trim();
  }

  #trim(): void {
    while (
      (this.#bytes > this.#maxBytes || this.#entries.size > this.#maxEntries) &&
      this.#entries.size > 0
    ) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      const entry = this.#entries.get(oldest.value)!;
      this.#entries.delete(oldest.value);
      this.#bytes -= entry.size;
      this.#evictions++;
    }
  }

  clear(): void {
    this.#entries.clear();
    this.#bytes = 0;
  }

  stats() {
    const total = this.#hits + this.#misses;
    return {
      entries: this.#entries.size,
      bytes: this.#bytes,
      maxBytes: this.#maxBytes,
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
      hitRate: total === 0 ? 0 : Number((this.#hits / total).toFixed(4)),
    };
  }
}
