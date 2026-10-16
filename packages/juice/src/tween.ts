import { type EaseName, type Easing, ease } from "./ease.js";

type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];

export interface TweenOptions {
  duration: number;
  ease?: EaseName | Easing;
  delay?: number;
  /** Play forward then back. */
  yoyo?: boolean;
  /** Extra repetitions; -1 repeats forever. */
  repeat?: number;
  onComplete?: () => void;
}

export interface Tween {
  readonly done: boolean;
  cancel(): void;
  /** Resolves when the tween completes (not when cancelled). */
  readonly finished: Promise<void>;
}

interface Active {
  target: Record<string, number>;
  from: Record<string, number>;
  to: Record<string, number>;
  duration: number;
  easing: Easing;
  delay: number;
  time: number;
  yoyo: boolean;
  repeat: number;
  done: boolean;
  resolve: () => void;
  onComplete: (() => void) | undefined;
}

/** Tweens numeric properties of any object. Drive with `update(dt)` from the game loop. */
export class Tweens {
  private active: Active[] = [];

  to<T extends object>(target: T, props: Partial<Pick<T, NumericKeys<T>>>, options: TweenOptions): Tween {
    const t = target as unknown as Record<string, number>;
    const to = props as Record<string, number>;
    const from: Record<string, number> = {};
    for (const key of Object.keys(to)) from[key] = t[key] ?? 0;
    let resolve!: () => void;
    const finished = new Promise<void>((r) => (resolve = r));
    const a: Active = {
      target: t,
      from,
      to,
      duration: Math.max(options.duration, 1e-6),
      easing: typeof options.ease === "function" ? options.ease : ease[options.ease ?? "outQuad"],
      delay: options.delay ?? 0,
      time: 0,
      yoyo: options.yoyo ?? false,
      repeat: options.repeat ?? 0,
      done: false,
      resolve,
      onComplete: options.onComplete,
    };
    this.active.push(a);
    return {
      get done() {
        return a.done;
      },
      cancel: () => {
        a.done = true;
      },
      finished,
    };
  }

  /** Cancel all tweens on a target. */
  kill(target: object): void {
    for (const a of this.active) if (a.target === target) a.done = true;
  }

  get count(): number {
    return this.active.length;
  }

  update(dt: number): void {
    for (const a of this.active) {
      if (a.done) continue;
      let step = dt;
      if (a.delay > 0) {
        a.delay -= step;
        if (a.delay > 0) continue;
        step = -a.delay;
        a.delay = 0;
      }
      a.time += step;
      const span = a.yoyo ? a.duration * 2 : a.duration;
      let t = Math.min(a.time / a.duration, a.yoyo ? 2 : 1);
      if (t > 1) t = 2 - t;
      const k = a.easing(t);
      for (const key in a.to) {
        const from = a.from[key] ?? 0;
        a.target[key] = from + ((a.to[key] ?? from) - from) * k;
      }
      if (a.time >= span) {
        if (a.repeat !== 0) {
          a.time -= span;
          if (a.repeat > 0) a.repeat--;
        } else {
          a.done = true;
          a.onComplete?.();
          a.resolve();
        }
      }
    }
    if (this.active.some((a) => a.done)) this.active = this.active.filter((a) => !a.done);
  }
}
