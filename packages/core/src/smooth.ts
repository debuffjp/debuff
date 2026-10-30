import type { Game } from "./game.js";

/** Anything with a position: a player object, an enemy, a `Sprite`. */
export interface Positioned {
  x: number;
  y: number;
}

/** What `smoothMotion` reads each step: objects, or arrays of them (one level, so `[player, enemies]` works). */
export type MotionSource = () => Iterable<Positioned | readonly Positioned[]>;

interface Before {
  x: number;
  y: number;
  /** `clock.tick` when it was saved, i.e. the step that moved the object from here. */
  tick: number;
}

/**
 * Smooth drawing between fixed steps. The simulation runs at 60 Hz, so on a 120 Hz display (or any frame
 * between two steps) an object drawn at its position jumps every other frame. Draw it at `x(o)`, `y(o)`
 * instead: its position blended from where it was before the latest step by the render `alpha`.
 *
 * Positions are saved before every step for the objects `objects()` returns, so new objects need no
 * registering and removed ones no clean-up. An object is drawn where it is, unblended, when the latest step
 * didn't save it: just created, after a frozen step (`game.freeze`), or after `snap(o)` (call it when you
 * teleport something, so it doesn't streak across the screen for one step).
 *
 * Rendering only: it never changes positions, so replays and tests are unaffected. Only `x` and `y` blend.
 */
export class SmoothMotion {
  private readonly before = new WeakMap<Positioned, Before>();
  private readonly off: () => void;

  constructor(
    private readonly game: Game,
    private readonly objects: MotionSource,
  ) {
    this.off = game.hooks.beforeUpdate(() => this.save());
  }

  /** `o.x` where it should be drawn this frame. `alpha` defaults to this render's (`game.camera.renderAlpha`). */
  x(o: Positioned, alpha = this.game.camera.renderAlpha): number {
    const b = this.fresh(o);
    return b ? b.x + (o.x - b.x) * alpha : o.x;
  }

  /** `o.y` where it should be drawn this frame. */
  y(o: Positioned, alpha = this.game.camera.renderAlpha): number {
    const b = this.fresh(o);
    return b ? b.y + (o.y - b.y) * alpha : o.y;
  }

  /** Both, as a new object. Prefer `x()` and `y()` for many objects a frame. */
  at(o: Positioned, alpha = this.game.camera.renderAlpha): Positioned {
    return { x: this.x(o, alpha), y: this.y(o, alpha) };
  }

  /** Draw `o` where it is until the next step: after a teleport, a respawn or a warp. */
  snap(o: Positioned): void {
    this.before.delete(o);
  }

  /** Stop saving positions. */
  dispose(): void {
    this.off();
  }

  private save(): void {
    const tick = this.game.clock.tick;
    for (const item of this.objects()) {
      if (Array.isArray(item)) for (const o of item as readonly Positioned[]) this.before.set(o, { x: o.x, y: o.y, tick });
      else this.before.set(item as Positioned, { x: (item as Positioned).x, y: (item as Positioned).y, tick });
    }
  }

  /** The saved position, if it's from the step that just ran. */
  private fresh(o: Positioned): Before | undefined {
    const b = this.before.get(o);
    return b && b.tick === this.game.clock.tick - 1 ? b : undefined;
  }
}

/**
 * Smooth drawing between fixed steps for the objects `objects` returns, read before every step.
 *
 * ```ts
 * const smooth = smoothMotion(game, () => [player, enemies, shots]);
 * // in render:
 * draw.sprite(img, smooth.x(player), smooth.y(player));
 * for (const e of enemies) draw.sprite(enemyImg, smooth.x(e), smooth.y(e));
 * // after moving something instantly:
 * smooth.snap(player);
 * ```
 */
export function smoothMotion(game: Game, objects: MotionSource): SmoothMotion {
  return new SmoothMotion(game, objects);
}
