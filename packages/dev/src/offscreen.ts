import type { Draw, Frame, Game, SpriteDrawOptions, TextureSource } from "@debuffjp/core";

/** What one measured frame drew. */
export interface OffscreenReading {
  tick: number;
  /** Sprites drawn to the screen this frame, counted one by one (`draw.sprite`, plain `draw.sprites`). */
  sprites: number;
  /** How many of those were certainly outside the view. */
  offscreen: number;
}

/** One frame in this many is measured, so the other frames run the renderer untouched. */
const EVERY = 60;
/** Below this the waste can't matter, whatever the share. */
const MIN_OFFSCREEN = 1000;
const MIN_SHARE = 0.5;

/** Advice for a reading, or undefined when the game draws little outside the view. */
export function offscreenHint(r: OffscreenReading): string | undefined {
  if (r.offscreen < MIN_OFFSCREEN || r.offscreen / r.sprites < MIN_SHARE) return undefined;
  return (
    `${r.offscreen} of ${r.sprites} sprites were drawn outside the view. Skip them with camera.sees(x, y, w, h), ` +
    "or pass { camera } to tilemap.draw. See https://debuff.jp/docs/big-worlds"
  );
}

const sizeOf = (f: Frame | TextureSource): [number, number] => {
  if ("w" in f) return [f.w, f.h];
  const s = f as unknown as { width?: number; height?: number };
  return [s.width ?? 0, s.height ?? 0];
};

/**
 * Counts sprites drawn outside the view, for the dev tools. It swaps `draw.sprite`, `draw.sprites` and `draw.into`
 * on the instance for one frame in `EVERY`, so spryte's hot path carries no dev code. A sprite counts as outside
 * only if a circle big enough for any origin and rotation misses the view, so it never overcounts. Render targets
 * have their own space and are skipped; so are recorded layers, whose replay costs almost nothing per sprite.
 */
export class OffscreenSampler {
  /** The latest measured frame. */
  latest: OffscreenReading | undefined;
  private frames = 0;
  private warned = false;
  private readonly cleanups: (() => void)[];

  constructor(private readonly game: Game) {
    let measuring = false;
    this.cleanups = [
      game.hooks.beforeRender((draw) => {
        if (this.frames++ % EVERY !== 0) return;
        measuring = true;
        this.install(draw);
      }),
      game.hooks.afterRender((draw) => {
        if (!measuring) return;
        measuring = false;
        this.remove(draw);
        this.report();
      }),
    ];
  }

  dispose(): void {
    for (const c of this.cleanups) c();
  }

  private install(draw: Draw): void {
    const { game } = this;
    const reading: OffscreenReading = { tick: game.clock.tick, sprites: 0, offscreen: 0 };
    this.latest = reading;
    const m = draw.m;
    // The largest scale the current transform applies, so the circle stays big enough under zoom.
    const outside = (x: number, y: number, r: number) => {
      const grow = Math.hypot(m[0], m[1]) + Math.hypot(m[2], m[3]);
      const reach = r * grow;
      const sx = m[0] * x + m[2] * y + m[4];
      const sy = m[1] * x + m[3] * y + m[5];
      return sx + reach < 0 || sx - reach > game.width || sy + reach < 0 || sy - reach > game.height;
    };
    const { sprite, sprites, into } = draw;
    let inTarget = 0;
    draw.sprite = (frame: Frame | TextureSource, x: number, y: number, o?: SpriteDrawOptions) => {
      if (!inTarget) {
        const [w, h] = sizeOf(frame);
        const scale = Math.max(Math.abs(o?.scaleX ?? 1), Math.abs(o?.scaleY ?? 1));
        reading.sprites++;
        if (outside(x, y, Math.hypot(w, h) * scale)) reading.offscreen++;
      }
      sprite.call(draw, frame, x, y, o);
    };
    draw.sprites = (frame, positions, count = positions.length >> 1, o, each) => {
      if (!inTarget && !Array.isArray(frame) && !each?.stride && each?.scale === undefined) {
        const [w, h] = sizeOf(frame as Frame | TextureSource);
        const r = Math.hypot(w, h) * Math.max(Math.abs(o?.scaleX ?? 1), Math.abs(o?.scaleY ?? 1));
        reading.sprites += count;
        for (let i = 0; i < count; i++) if (outside(positions[i * 2] ?? 0, positions[i * 2 + 1] ?? 0, r)) reading.offscreen++;
      }
      sprites.call(draw, frame, positions, count, o, each);
    };
    draw.into = (target, fn, clear) => {
      inTarget++;
      try {
        into.call(draw, target, fn, clear);
      } finally {
        inTarget--;
      }
    };
  }

  private remove(draw: Draw): void {
    const own = draw as unknown as Record<string, unknown>;
    delete own.sprite;
    delete own.sprites;
    delete own.into;
  }

  private report(): void {
    const hint = this.latest && offscreenHint(this.latest);
    if (!hint || this.warned) return;
    this.warned = true;
    console.warn(`[debuff] ${hint}`);
  }
}
