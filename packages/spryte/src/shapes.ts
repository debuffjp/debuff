import type { Matrix } from "./backend.js";

/** Longest miter, in half line widths, before it's cut short (Canvas 2D bevels past the same limit). */
const MITER = 4;

/**
 * Triangles for the WebGL2 backend's `path()`: x, y, coverage (floats) and a colour (RGBA bytes) per vertex.
 * Edges get a feather one device pixel wide fading to coverage 0, which antialiases without MSAA.
 * @internal
 */
export class ShapeBuffer {
  data = new ArrayBuffer(1 << 16);
  f32 = new Float32Array(this.data);
  u32 = new Uint32Array(this.data);
  /** Vertices written. */
  count = 0;
  private m: Matrix = [1, 0, 0, 1, 0, 0];
  private color = 0;
  private xs = new Float64Array(64);
  private ys = new Float64Array(64);
  private nx = new Float64Array(64);
  private ny = new Float64Array(64);
  /** The inner ring of a fill. */
  private ix = new Float64Array(64);
  private iy = new Float64Array(64);

  /** Fill (`width` 0) or stroke `n` points. `aa` is one device pixel in the points' units; `color` is RGBA bytes in memory order. */
  add(m: Matrix, points: ArrayLike<number>, n: number, closed: boolean, width: number, color: number, aa: number): void {
    this.m = m;
    this.color = color;
    n = this.load(points, n, closed || width === 0);
    if (width === 0) this.fill(n, aa);
    else this.stroke(n, closed, width, aa);
  }

  /** Copy points, dropping repeats; returns how many are left. Closed shapes also drop a last point equal to the first. */
  private load(points: ArrayLike<number>, n: number, closed: boolean): number {
    if (this.xs.length < n) {
      const size = 2 ** Math.ceil(Math.log2(n));
      this.xs = new Float64Array(size);
      this.ys = new Float64Array(size);
      this.nx = new Float64Array(size);
      this.ny = new Float64Array(size);
      this.ix = new Float64Array(size);
      this.iy = new Float64Array(size);
    }
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x = points[i * 2] as number;
      const y = points[i * 2 + 1] as number;
      if (k > 0 && x === this.xs[k - 1] && y === this.ys[k - 1]) continue;
      this.xs[k] = x;
      this.ys[k] = y;
      k++;
    }
    if (closed && k > 1 && this.xs[0] === this.xs[k - 1] && this.ys[0] === this.ys[k - 1]) k--;
    return k;
  }

  /** Miter normals (left of travel) scaled so offsetting by 1 moves each edge by 1, clamped at MITER. */
  private normals(n: number, closed: boolean): void {
    const { xs, ys, nx, ny } = this;
    for (let i = 0; i < n; i++) {
      const p = i > 0 ? i - 1 : closed ? n - 1 : i;
      const q = i < n - 1 ? i + 1 : closed ? 0 : i;
      // Left normals of the edges into and out of this point.
      let ax = (ys[p] as number) - (ys[i] as number);
      let ay = (xs[i] as number) - (xs[p] as number);
      let bx = (ys[i] as number) - (ys[q] as number);
      let by = (xs[q] as number) - (xs[i] as number);
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (la > 0) {
        ax /= la;
        ay /= la;
      }
      if (lb > 0) {
        bx /= lb;
        by /= lb;
      }
      if (la === 0) {
        ax = bx;
        ay = by;
      } else if (lb === 0) {
        bx = ax;
        by = ay;
      }
      let mx = ax + bx;
      let my = ay + by;
      const lm = Math.hypot(mx, my);
      if (lm < 1e-9) {
        mx = ax;
        my = ay;
      } else {
        mx /= lm;
        my /= lm;
        const s = Math.min(MITER, 1 / Math.max(mx * ax + my * ay, 1e-9));
        mx *= s;
        my *= s;
      }
      nx[i] = mx;
      ny[i] = my;
    }
  }

  private fill(n: number, aa: number): void {
    if (n < 3) return;
    const { xs, ys, nx, ny } = this;
    // Wind one way, so left normals point inward.
    let area = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) area += (xs[j] as number) * (ys[i] as number) - (xs[i] as number) * (ys[j] as number);
    if (area === 0) return;
    if (area < 0) {
      xs.subarray(0, n).reverse();
      ys.subarray(0, n).reverse();
    }
    this.normals(n, true);
    const h = aa / 2;
    // Inner ring (coverage 1) a half pixel in, outer (0) a half pixel out.
    const { ix, iy } = this;
    for (let i = 0; i < n; i++) {
      ix[i] = (xs[i] as number) + (nx[i] as number) * h;
      iy[i] = (ys[i] as number) + (ny[i] as number) * h;
    }
    earClip(ix, iy, n, (a, b, c) => {
      this.vertex(ix[a] as number, iy[a] as number, 1);
      this.vertex(ix[b] as number, iy[b] as number, 1);
      this.vertex(ix[c] as number, iy[c] as number, 1);
    });
    for (let i = 0; i < n; i++) {
      const j = i === n - 1 ? 0 : i + 1;
      const ox = (xs[i] as number) - (nx[i] as number) * h;
      const oy = (ys[i] as number) - (ny[i] as number) * h;
      const px = (xs[j] as number) - (nx[j] as number) * h;
      const py = (ys[j] as number) - (ny[j] as number) * h;
      this.band(ix[i] as number, iy[i] as number, 1, ox, oy, 0, ix[j] as number, iy[j] as number, 1, px, py, 0);
    }
  }

  private stroke(n: number, closed: boolean, width: number, aa: number): void {
    if (n < 2) return;
    if (closed && n < 3) closed = false;
    const { xs, ys, nx, ny } = this;
    this.normals(n, closed);
    const half = width / 2;
    const hi = Math.max(half - aa / 2, 0);
    const ho = half + aa / 2;
    // Lines thinner than a pixel fade instead of shrinking below one.
    const core = Math.min(1, width / aa);
    const segments = closed ? n : n - 1;
    for (let i = 0; i < segments; i++) {
      const j = i === n - 1 ? 0 : i + 1;
      const x0 = xs[i] as number;
      const y0 = ys[i] as number;
      const x1 = xs[j] as number;
      const y1 = ys[j] as number;
      const ax = nx[i] as number;
      const ay = ny[i] as number;
      const bx = nx[j] as number;
      const by = ny[j] as number;
      // Left fringe, core, right fringe.
      this.band(
        x0 + ax * ho,
        y0 + ay * ho,
        0,
        x0 + ax * hi,
        y0 + ay * hi,
        core,
        x1 + bx * ho,
        y1 + by * ho,
        0,
        x1 + bx * hi,
        y1 + by * hi,
        core,
      );
      this.band(
        x0 + ax * hi,
        y0 + ay * hi,
        core,
        x0 - ax * hi,
        y0 - ay * hi,
        core,
        x1 + bx * hi,
        y1 + by * hi,
        core,
        x1 - bx * hi,
        y1 - by * hi,
        core,
      );
      this.band(
        x0 - ax * hi,
        y0 - ay * hi,
        core,
        x0 - ax * ho,
        y0 - ay * ho,
        0,
        x1 - bx * hi,
        y1 - by * hi,
        core,
        x1 - bx * ho,
        y1 - by * ho,
        0,
      );
    }
  }

  /** Two triangles joining edge (a, b) to edge (c, d). */
  private band(
    ax: number,
    ay: number,
    ac: number,
    bx: number,
    by: number,
    bc: number,
    cx: number,
    cy: number,
    cc: number,
    dx: number,
    dy: number,
    dc: number,
  ): void {
    this.vertex(ax, ay, ac);
    this.vertex(bx, by, bc);
    this.vertex(cx, cy, cc);
    this.vertex(bx, by, bc);
    this.vertex(dx, dy, dc);
    this.vertex(cx, cy, cc);
  }

  private vertex(x: number, y: number, coverage: number): void {
    if ((this.count + 1) * 16 > this.data.byteLength) {
      const old = this.f32;
      this.data = new ArrayBuffer(this.data.byteLength * 2);
      this.f32 = new Float32Array(this.data);
      this.u32 = new Uint32Array(this.data);
      this.f32.set(old);
    }
    const m = this.m;
    const f = this.count * 4;
    this.f32[f] = m[0] * x + m[2] * y + m[4];
    this.f32[f + 1] = m[1] * x + m[3] * y + m[5];
    this.f32[f + 2] = coverage;
    this.u32[f + 3] = this.color;
    this.count++;
  }
}

/** Reused by `earClip`, so filling shapes every frame doesn't allocate. */
const INDICES: number[] = [];

/**
 * Triangulate a simple polygon wound so its interior is on the left (positive signed area in y-down space).
 * O(n²), fine for UI and debug shapes. Self-intersecting input still produces triangles, just not exact ones.
 */
export function earClip(xs: ArrayLike<number>, ys: ArrayLike<number>, n: number, tri: (a: number, b: number, c: number) => void): void {
  const idx = INDICES;
  idx.length = 0;
  for (let k = 0; k < n; k++) idx.push(k);
  let guard = 0;
  let i = 0;
  while (idx.length > 3 && guard < idx.length) {
    const len = idx.length;
    const a = idx[(i + len - 1) % len] as number;
    const b = idx[i % len] as number;
    const c = idx[(i + 1) % len] as number;
    if (isEar(xs, ys, idx, a, b, c)) {
      tri(a, b, c);
      idx.splice(i % len, 1);
      guard = 0;
    } else {
      i++;
      guard++;
    }
    i %= idx.length;
  }
  if (idx.length === 3) tri(idx[0] as number, idx[1] as number, idx[2] as number);
  // No ear left (degenerate or self-intersecting): fan the rest.
  else for (let k = 1; k + 1 < idx.length; k++) tri(idx[0] as number, idx[k] as number, idx[k + 1] as number);
}

function cross(xs: ArrayLike<number>, ys: ArrayLike<number>, a: number, b: number, c: number): number {
  const ax = xs[a] as number;
  const ay = ys[a] as number;
  return ((xs[b] as number) - ax) * ((ys[c] as number) - ay) - ((ys[b] as number) - ay) * ((xs[c] as number) - ax);
}

function isEar(xs: ArrayLike<number>, ys: ArrayLike<number>, idx: number[], a: number, b: number, c: number): boolean {
  if (cross(xs, ys, a, b, c) <= 0) return false;
  for (const p of idx) {
    if (p === a || p === b || p === c) continue;
    if (cross(xs, ys, a, b, p) >= 0 && cross(xs, ys, b, c, p) >= 0 && cross(xs, ys, c, a, p) >= 0) return false;
  }
  return true;
}
