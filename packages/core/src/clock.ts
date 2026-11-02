/** Fixed-timestep accumulator. Simulation advances in exact `step` increments so
 *  scenarios can replay identically; rendering receives the leftover `alpha`. */
export interface FixedClockOptions {
  /** Simulation step in seconds. Default 1/60. */
  step?: number;
  /** Cap on real elapsed time per frame, to avoid a spiral after tab switches. Default 0.25s. */
  maxFrame?: number;
  /**
   * Stop catching up once a frame's steps have taken this many real milliseconds, and drop the rest of the
   * backlog, so a simulation too heavy for real time runs slower instead of collapsing the frame rate. At least
   * one step runs per due frame. Off by default. `game.step()` takes one step per call, so scenarios and
   * replays are unaffected. Added in 0.28.
   */
  budgetMs?: number;
}

export class FixedClock {
  readonly step: number;
  readonly maxFrame: number;
  readonly budgetMs: number | undefined;
  /** Total simulated seconds. */
  time = 0;
  /** Total simulation steps taken. */
  tick = 0;
  private accumulator = 0;

  constructor(options: FixedClockOptions = {}) {
    this.step = options.step ?? 1 / 60;
    this.maxFrame = options.maxFrame ?? 0.25;
    this.budgetMs = options.budgetMs;
  }

  /** Feed real elapsed seconds; calls `update` once per whole step. Returns render alpha in [0, 1). */
  advance(elapsed: number, update: (dt: number) => void): number {
    // Small epsilon absorbs float drift so e.g. 0.1 + 0.1 + 0.05 doesn't lose a step.
    this.accumulator += Math.min(Math.max(elapsed, 0), this.maxFrame);
    const start = this.budgetMs === undefined ? 0 : performance.now();
    while (this.accumulator >= this.step - 1e-9) {
      update(this.step);
      this.accumulator = Math.max(0, this.accumulator - this.step);
      this.time += this.step;
      this.tick++;
      if (this.budgetMs !== undefined && performance.now() - start >= this.budgetMs) {
        this.accumulator %= this.step;
        break;
      }
    }
    return this.accumulator / this.step;
  }
}
