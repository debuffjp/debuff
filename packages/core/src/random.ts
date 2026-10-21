/** Seeded PRNG (mulberry32). Use instead of Math.random for reproducible gameplay. */
export class Random {
  private s: number;

  constructor(seed = 1) {
    this.s = seed >>> 0;
  }

  /**
   * The generator's whole state, a uint32. Save it with a snapshot and set it back to undo or replay:
   * the same state gives the same sequence.
   */
  get state(): number {
    return this.s;
  }

  set state(value: number) {
    this.s = value >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Random.pick: empty array");
    return items[this.int(0, items.length - 1)] as T;
  }
}
