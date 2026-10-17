/**
 * How long to play. A number is a count of fixed simulation steps; a string is game time in
 * seconds (`"0.5s"`) or milliseconds (`"250ms"`), rounded to the nearest whole step.
 *
 * ```ts
 * game.wait(30);       // 30 steps (half a second at the default 60 steps per second)
 * game.wait("0.5s");   // the same, written as time
 * game.wait("250ms");  // 15 steps
 * ```
 */
export type Duration = number | `${number}s` | `${number}ms`;

/** Convert a {@link Duration} to whole simulation steps for a clock with the given step length (seconds). */
export function toSteps(duration: Duration, stepSeconds: number): number {
  if (typeof duration === "number") {
    if (!Number.isInteger(duration) || duration < 0) {
      throw new TypeError(`A step count must be a whole number of steps, 0 or more; got ${duration}. For time, write "${duration}s".`);
    }
    return duration;
  }
  const match = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(ms|s)\s*$/.exec(duration);
  if (!match)
    throw new TypeError(`Can't read the duration "${duration}". Use a step count (30), seconds ("0.5s") or milliseconds ("250ms").`);
  const seconds = Number(match[1]) / (match[2] === "ms" ? 1000 : 1);
  return Math.round(seconds / stepSeconds);
}

/** `"42 steps (0.70s)"`, for messages. */
export function describeSteps(steps: number, stepSeconds: number): string {
  return `${steps} step${steps === 1 ? "" : "s"} (${(steps * stepSeconds).toFixed(2)}s)`;
}
