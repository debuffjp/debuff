/** Rolling frame timing. `interval` is time between frames (what the player feels);
 *  `work` is time spent inside `Game.frame` (what the game costs). No allocation per frame. */
export class FrameStats {
  private readonly intervals: Float64Array;
  private readonly work: Float64Array;
  private index = 0;
  private count = 0;

  constructor(readonly size = 120) {
    this.intervals = new Float64Array(size);
    this.work = new Float64Array(size);
  }

  record(intervalMs: number, workMs: number): void {
    this.intervals[this.index] = intervalMs;
    this.work[this.index] = workMs;
    this.index = (this.index + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
  }

  get fps(): number {
    const avg = this.mean(this.intervals);
    return avg > 0 ? 1000 / avg : 0;
  }

  /** Snapshot for dev overlays, reports and scenarios. */
  summary(): { fps: number; frameMs: number; workMs: number; workP95Ms: number; samples: number } {
    return {
      fps: Math.round(this.fps),
      frameMs: round(this.mean(this.intervals)),
      workMs: round(this.mean(this.work)),
      workP95Ms: round(this.percentile(this.work, 0.95)),
      samples: this.count,
    };
  }

  private mean(buf: Float64Array): number {
    if (!this.count) return 0;
    let sum = 0;
    for (const v of buf.subarray(0, this.count)) sum += v;
    return sum / this.count;
  }

  private percentile(buf: Float64Array, p: number): number {
    if (!this.count) return 0;
    const sorted = buf.slice(0, this.count).sort();
    return sorted[Math.min(this.count - 1, Math.floor(p * this.count))] ?? 0;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
