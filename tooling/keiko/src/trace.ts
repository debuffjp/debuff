/**
 * A value recorded once per simulation step, from {@link Playtest.trace}. Step 0 is the first step
 * played, so `trace.at(i)` is the value after `i + 1` steps.
 *
 * Traces answer questions about motion over time, the kind that single snapshots miss:
 *
 * ```ts
 * game.tap("Space");
 * const y = game.trace("player.y", "1s");
 * expect(y.start - y.min()).toBeAbove(40);    // the jump rises at least 40 px (y grows downward)
 * expect(y.stepOf(y.min())).toBeBelow(30);    // and peaks within half a second
 * expect(y.last).toBeCloseTo(y.start, 0.5);   // and lands where it took off
 * ```
 */
export class Trace<T = unknown> implements Iterable<T> {
  constructor(
    /** One value per step played, oldest first. */
    readonly values: readonly T[],
    /** The value just before the first step (the state the trace started from). */
    readonly start: T,
    /** What was traced, for messages. */
    readonly label: string,
    /** Seconds per step, so steps can be reported as time. */
    readonly stepSeconds: number,
  ) {}

  /** Number of steps recorded. */
  get length(): number {
    return this.values.length;
  }

  /** The value after the first step. */
  get first(): T {
    return this.must(0);
  }

  /** The value after the last step. */
  get last(): T {
    return this.must(this.values.length - 1);
  }

  /** The value after step `i` (negative counts from the end, like `Array.prototype.at`). */
  at(i: number): T {
    return this.must(i < 0 ? this.values.length + i : i);
  }

  /** The largest value. Numbers only. */
  max(): number {
    return Math.max(...this.numbers("max"));
  }

  /** The smallest value. Numbers only. */
  min(): number {
    return Math.min(...this.numbers("min"));
  }

  /** `max() - min()`: how far the value travelled at most. Numbers only. */
  range(): number {
    return this.max() - this.min();
  }

  /** The first step whose value equals `value` (or matches the predicate), or -1. */
  stepOf(value: T | ((v: T, step: number) => boolean)): number {
    return typeof value === "function"
      ? this.values.findIndex((v, i) => (value as (v: T, step: number) => boolean)(v, i))
      : this.values.findIndex((v) => Object.is(v, value));
  }

  /** True when every step's value passes. */
  every(test: (v: T, step: number) => boolean): boolean {
    return this.values.every(test);
  }

  /** True when any step's value passes. */
  some(test: (v: T, step: number) => boolean): boolean {
    return this.values.some(test);
  }

  /** How many times the value changed between consecutive steps (including from `start`). */
  changes(): number {
    let n = 0;
    let prev = this.start;
    for (const v of this.values) {
      if (!Object.is(v, prev)) n++;
      prev = v;
    }
    return n;
  }

  /** Seconds of game time that step `i` ends at, counted from the start of the trace. */
  timeAt(step: number): number {
    return (step + 1) * this.stepSeconds;
  }

  [Symbol.iterator](): Iterator<T> {
    return this.values[Symbol.iterator]();
  }

  private must(i: number): T {
    if (i < 0 || i >= this.values.length)
      throw new RangeError(`Trace of ${this.label} has ${this.values.length} steps; there's no step ${i}`);
    return this.values[i] as T;
  }

  private numbers(op: string): number[] {
    if (!this.values.length) throw new RangeError(`Trace of ${this.label} is empty, so it has no ${op}`);
    const bad = this.values.findIndex((v) => typeof v !== "number" || Number.isNaN(v));
    if (bad >= 0) throw new TypeError(`${op}() needs numbers, but ${this.label} was ${String(this.values[bad])} at step ${bad}`);
    return this.values as unknown as number[];
  }
}
