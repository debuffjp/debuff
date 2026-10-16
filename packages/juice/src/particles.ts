import type { DrawLike } from "./draw-like.js";

/** Pooled particle system drawn as rects or circles. Particles live in world space;
 *  draw inside the camera transform. */
export interface EmitOptions {
  x: number;
  y: number;
  count?: number;
  /** Speed range in px/s. */
  speed?: [number, number];
  /** Direction in radians and spread around it. Default: full circle. */
  angle?: number;
  spread?: number;
  /** Lifetime range in seconds. */
  life?: [number, number];
  /** Size range in px; shrinks to `sizeEnd` (fraction of start) over life. */
  size?: [number, number];
  sizeEnd?: number;
  colors?: readonly string[];
  /** Downward acceleration px/s². */
  gravity?: number;
  /** Velocity multiplier per second (0.1 = strong drag). */
  drag?: number;
  shape?: "rect" | "circle";
  /** Additive blending for glows. */
  additive?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  sizeEnd: number;
  color: string;
  gravity: number;
  drag: number;
  circle: boolean;
  additive: boolean;
}

export type RandomSource = () => number;

export class Particles {
  private readonly live: Particle[] = [];
  private readonly pool: Particle[] = [];

  /** @param random Supply the game's seeded RNG for reproducible effects. */
  constructor(
    private readonly random: RandomSource = Math.random,
    readonly max = 2000,
  ) {}

  get count(): number {
    return this.live.length;
  }

  emit(o: EmitOptions): void {
    const r = this.random;
    const range = (v: [number, number]) => v[0] + (v[1] - v[0]) * r();
    const count = o.count ?? 10;
    const colors = o.colors ?? ["#fff"];
    for (let i = 0; i < count && this.live.length < this.max; i++) {
      const p = this.pool.pop() ?? ({} as Particle);
      const angle = (o.angle ?? 0) + (r() - 0.5) * (o.spread ?? Math.PI * 2);
      const speed = range(o.speed ?? [40, 120]);
      p.x = o.x;
      p.y = o.y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.maxLife = p.life = range(o.life ?? [0.3, 0.6]);
      p.size = range(o.size ?? [2, 4]);
      p.sizeEnd = o.sizeEnd ?? 0;
      p.color = colors[Math.floor(r() * colors.length)] ?? "#fff";
      p.gravity = o.gravity ?? 0;
      p.drag = o.drag ?? 1;
      p.circle = o.shape === "circle";
      p.additive = o.additive ?? false;
      this.live.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      if (!p) continue;
      p.life -= dt;
      if (p.life <= 0) {
        // Swap-remove to avoid shifting.
        const last = this.live.pop();
        if (last && last !== p) this.live[i] = last;
        this.pool.push(p);
        continue;
      }
      const d = p.drag === 1 ? 1 : p.drag ** dt;
      p.vx *= d;
      p.vy = p.vy * d + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /** Draw in the current transform (e.g. inside `draw.withCamera`). Additive particles batch together. */
  draw(draw: DrawLike): void {
    const baseAlpha = draw.alpha;
    let additive = false;
    for (const p of this.live) {
      if (p.additive !== additive) {
        additive = p.additive;
        draw.blend(additive ? "add" : "normal");
      }
      const t = p.life / p.maxLife;
      const s = p.size * (p.sizeEnd + (1 - p.sizeEnd) * t);
      draw.alpha = baseAlpha * Math.min(1, t * 2);
      if (p.circle) draw.circle(p.x, p.y, s / 2, p.color);
      else draw.rect(p.x - s / 2, p.y - s / 2, s, s, p.color);
    }
    if (additive) draw.blend("normal");
    draw.alpha = baseAlpha;
  }

  clear(): void {
    this.pool.push(...this.live);
    this.live.length = 0;
  }
}
