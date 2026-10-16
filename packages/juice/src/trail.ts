import type { DrawLike } from "./draw-like.js";

/** Fading polyline behind a moving point (dashes, projectiles, swipes). */
export class Trail {
  private readonly xs: number[] = [];
  private readonly ys: number[] = [];

  constructor(
    readonly length = 12,
    public color = "#fff",
    public width = 3,
  ) {}

  push(x: number, y: number): void {
    this.xs.push(x);
    this.ys.push(y);
    if (this.xs.length > this.length) {
      this.xs.shift();
      this.ys.shift();
    }
  }

  clear(): void {
    this.xs.length = 0;
    this.ys.length = 0;
  }

  draw(draw: DrawLike): void {
    const n = this.xs.length;
    if (n < 2) return;
    const baseAlpha = draw.alpha;
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      draw.alpha = baseAlpha * t;
      draw.line(this.xs[i - 1] ?? 0, this.ys[i - 1] ?? 0, this.xs[i] ?? 0, this.ys[i] ?? 0, this.width * t, this.color);
    }
    draw.alpha = baseAlpha;
  }
}
