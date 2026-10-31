/** Anything with a position. */
export interface Point {
  x: number;
  y: number;
}

/** Cells per axis either side of 0 that get their own bucket; points further out share the edge cells. */
const RANGE = 1 << 20;
const SPAN = RANGE * 2 + 1;

/**
 * A uniform grid for "what's near this" queries: enemies near the player, shots against a crowd, a swarm
 * keeping its members apart. Put items in with `rebuild(items)` once per step (or `clear` and `insert`), then
 * ask `near` or `nearest`, which only look at the cells around the point instead of every item.
 *
 * Pick a cell size about the radius you query most. Results come in a fixed order (cells row by row, items
 * in insertion order), so replays and tests stay deterministic. After the first few steps it allocates
 * nothing: cell arrays are reused, and cells that empty out are released. Items are points: for big objects,
 * query with the radius plus their size. Don't insert or rebuild while a query is running; nested queries are fine.
 *
 * ```ts
 * const grid = new SpatialHash<Enemy>(24);
 * // in update, after moving:
 * grid.rebuild(enemies);
 * grid.near(shot.x, shot.y, 12, (e) => {
 *   hit(e);
 *   return true; // stop at the first
 * });
 * const target = grid.nearest(player.x, player.y, 200, (e) => !e.dead);
 * ```
 */
export class SpatialHash<T extends Point> {
  readonly cellSize: number;
  private readonly cells = new Map<number, T[]>();
  private readonly spare: T[][] = [];
  private items = 0;

  constructor(cellSize = 32) {
    if (!(cellSize > 0) || !Number.isFinite(cellSize))
      throw new RangeError(`SpatialHash: cellSize must be a positive number, got ${cellSize}`);
    this.cellSize = cellSize;
  }

  /** How many items are in the grid. */
  get size(): number {
    return this.items;
  }

  /**
   * Empty the grid, keeping its arrays for the next fill. Cells keep their place in the map from one fill to
   * the next (most are refilled, and re-adding them was a third slower); a cell that stayed empty for a whole
   * fill is released, so a world explored over time doesn't keep growing the grid.
   */
  clear(): void {
    for (const [key, bucket] of this.cells) {
      if (bucket.length === 0) {
        this.cells.delete(key);
        this.spare.push(bucket);
      } else bucket.length = 0;
    }
    this.items = 0;
  }

  /** Add one item at its current position. Moving it later doesn't move it in the grid: rebuild each step. */
  insert(item: T): void {
    const key = this.key(this.cell(item.x), this.cell(item.y));
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = this.spare.pop() ?? [];
      this.cells.set(key, bucket);
    }
    bucket.push(item);
    this.items++;
  }

  /** `clear()`, then insert every item. Call it once per step after things have moved. */
  rebuild(items: Iterable<T>): void {
    this.clear();
    for (const item of items) this.insert(item);
  }

  /**
   * Call `visit` for every item within `radius` of (x, y), measured centre to centre. Return `true` from `visit`
   * to stop. Returns true if it was stopped.
   */
  near(x: number, y: number, radius: number, visit: (item: T, distanceSquared: number) => boolean | undefined): boolean {
    const r2 = radius * radius;
    const x0 = this.cell(x - radius);
    const x1 = this.cell(x + radius);
    const y0 = this.cell(y - radius);
    const y1 = this.cell(y + radius);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const item of bucket) {
          const dx = item.x - x;
          const dy = item.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2 && visit(item, d2) === true) return true;
        }
      }
    return false;
  }

  /** The item closest to (x, y) within `radius` that `accept` allows (default: any). Ties go to the first found. */
  nearest(x: number, y: number, radius: number, accept?: (item: T) => boolean): T | undefined {
    let best: T | undefined;
    let bestD = Number.POSITIVE_INFINITY;
    this.near(x, y, radius, (item, d2) => {
      if (d2 < bestD && (!accept || accept(item))) {
        best = item;
        bestD = d2;
      }
    });
    return best;
  }

  private cell(v: number): number {
    const c = Math.floor(v / this.cellSize);
    // NaN and far-away points go to the edge cells: slower to query there, never wrong (distances are exact).
    return c >= -RANGE && c <= RANGE ? c : c < -RANGE ? -RANGE : RANGE;
  }

  private key(cx: number, cy: number): number {
    return (cx + RANGE) * SPAN + (cy + RANGE);
  }
}
