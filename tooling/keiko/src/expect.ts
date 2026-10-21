import { deepEqual, firstDifference, show } from "./values.js";

/**
 * Thrown when an expectation fails. The runner adds the game's tick, scene and state at the moment
 * of failure, so you see what the game looked like, not just the numbers.
 */
export class ExpectationError extends Error {
  override readonly name = "ExpectationError";
  constructor(
    message: string,
    /** The value under test. */
    readonly actual: unknown,
    /** What it was compared against, when there is a single value to show. */
    readonly expected?: unknown,
  ) {
    super(message);
  }
}

/**
 * Assertions on a value. Every matcher has a negated form through `.not`.
 *
 * Numbers in games are rarely exact, so prefer the range matchers (`toBeAbove`, `toBeBetween`,
 * `toBeCloseTo`) for positions and speeds, and `toBe` for counts, flags and scene names.
 */
export interface Matchers<T> {
  /** The same assertions, inverted: `expect(state.won).not.toBe(true)`. */
  readonly not: Matchers<T>;
  /** Strict equality (`Object.is`). For objects and arrays use {@link Matchers.toEqual}. */
  toBe(expected: T): void;
  /** Structural equality for plain data: objects, arrays, `Map`, `Set`, `Date`. Reports the first path that differs. */
  toEqual(expected: unknown): void;
  /** `actual > n` */
  toBeAbove(n: number): void;
  /** `actual < n` */
  toBeBelow(n: number): void;
  /** `actual >= n` */
  toBeAtLeast(n: number): void;
  /** Alias of {@link Matchers.toBeBelow}, for those used to Jest/Vitest. */
  toBeLessThan(n: number): void;
  /** Alias of {@link Matchers.toBeAbove}, for those used to Jest/Vitest. */
  toBeGreaterThan(n: number): void;
  /** `actual <= n` */
  toBeAtMost(n: number): void;
  /** `min <= actual <= max` */
  toBeBetween(min: number, max: number): void;
  /** `|actual - target| <= tolerance`. The default tolerance, 0.001, absorbs floating-point drift, not gameplay differences. */
  toBeCloseTo(target: number, tolerance?: number): void;
  /** Any truthy value. */
  toBeTruthy(): void;
  /** Any falsy value. */
  toBeFalsy(): void;
  /** Anything except `undefined`. Useful for "this entity exists". */
  toBeDefined(): void;
  toBeUndefined(): void;
  /** An array containing an element equal (structurally) to `item`, or a string containing a substring. */
  toContain(item: unknown): void;
  /** An array or string of exactly `length` items. */
  toHaveLength(length: number): void;
  /** A string matching a regular expression. */
  toMatch(pattern: RegExp): void;
  /** A function that throws when called, optionally with a message containing `text` or matching a pattern. */
  toThrow(message?: string | RegExp): void;
}

/**
 * Start an assertion.
 *
 * ```ts
 * expect(game.state.player.onGround).toBe(true);
 * expect(game.state.player.x).toBeBetween(100, 140);
 * expect(game.trace("player.y", "1s").min()).toBeBelow(80);
 * ```
 */
export function expect<T>(actual: T): Matchers<T> {
  return matchers(actual, false);
}

function matchers<T>(actual: T, negated: boolean): Matchers<T> {
  /** Throw unless `pass` (or `!pass` when negated). `what` reads after "expected <actual> to …". */
  const check = (pass: boolean, what: string, ...expected: [unknown?]) => {
    if (pass !== negated) return;
    const message = `expected ${show(actual)} ${negated ? "not " : ""}to ${what}`;
    throw expected.length ? new ExpectationError(message, actual, expected[0]) : new ExpectationError(message, actual);
  };
  const number = (matcher: string): number => {
    if (typeof actual !== "number" || Number.isNaN(actual)) {
      throw new ExpectationError(`${matcher} needs a number, got ${show(actual)}`, actual);
    }
    return actual;
  };

  return {
    get not() {
      return matchers(actual, !negated);
    },
    toBe: (expected) => check(Object.is(actual, expected), `be ${show(expected)}`, expected),
    toEqual(expected) {
      const diff = firstDifference(actual, expected);
      const where = diff ? ` (first difference at ${diff || "the top level"})` : "";
      check(diff === undefined, `equal ${show(expected)}${negated ? "" : where}`, expected);
    },
    toBeAbove: (n) => check(number("toBeAbove") > n, `be above ${n}`, n),
    toBeBelow: (n) => check(number("toBeBelow") < n, `be below ${n}`, n),
    toBeLessThan: (n) => check(number("toBeLessThan") < n, `be less than ${n}`, n),
    toBeGreaterThan: (n) => check(number("toBeGreaterThan") > n, `be greater than ${n}`, n),
    toBeAtLeast: (n) => check(number("toBeAtLeast") >= n, `be at least ${n}`, n),
    toBeAtMost: (n) => check(number("toBeAtMost") <= n, `be at most ${n}`, n),
    toBeBetween(min, max) {
      const v = number("toBeBetween");
      check(v >= min && v <= max, `be between ${min} and ${max}`);
    },
    toBeCloseTo(target, tolerance = 0.001) {
      const v = number("toBeCloseTo");
      check(Math.abs(v - target) <= tolerance, `be ${target} ± ${tolerance} (off by ${Math.abs(v - target).toPrecision(3)})`, target);
    },
    toBeTruthy: () => check(Boolean(actual), "be truthy"),
    toBeFalsy: () => check(!actual, "be falsy"),
    toBeDefined: () => check(actual !== undefined, "be defined"),
    toBeUndefined: () => check(actual === undefined, "be undefined"),
    toContain(item) {
      if (typeof actual === "string") return check(typeof item === "string" && actual.includes(item), `contain ${show(item)}`);
      if (!Array.isArray(actual)) throw new ExpectationError(`toContain needs an array or string, got ${show(actual)}`, actual);
      check(
        actual.some((x) => deepEqual(x, item)),
        `contain ${show(item)}`,
      );
    },
    toHaveLength(length) {
      const has = (actual as { length?: unknown } | null | undefined)?.length;
      if (typeof has !== "number") throw new ExpectationError(`toHaveLength needs an array or string, got ${show(actual)}`, actual);
      check(has === length, `have length ${length} (has ${has})`, length);
    },
    toMatch(pattern) {
      if (typeof actual !== "string") throw new ExpectationError(`toMatch needs a string, got ${show(actual)}`, actual);
      check(pattern.test(actual), `match ${pattern}`);
    },
    toThrow(message) {
      if (typeof actual !== "function") throw new ExpectationError(`toThrow needs a function, got ${show(actual)}`, actual);
      let thrown: unknown;
      let threw = false;
      try {
        (actual as () => unknown)();
      } catch (err) {
        threw = true;
        thrown = err;
      }
      const text = thrown instanceof Error ? thrown.message : String(thrown);
      const matches = message === undefined || (typeof message === "string" ? text.includes(message) : message.test(text));
      const what = message === undefined ? "throw" : `throw ${typeof message === "string" ? show(message) : message}`;
      const got = threw ? ` (threw ${show(text)})` : " (it didn't throw)";
      check(threw && matches, `${what}${negated ? "" : got}`);
    },
  };
}
