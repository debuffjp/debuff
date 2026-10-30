import { describe, expect, it } from "vitest";
import { Random, SpatialHash } from "../src/index.js";

interface Thing {
  id: number;
  x: number;
  y: number;
}

function scatter(n: number, seed = 1, spread = 400): Thing[] {
  const random = new Random(seed);
  return Array.from({ length: n }, (_, id) => ({ id, x: random.range(-spread, spread), y: random.range(-spread, spread) }));
}

const within = (items: Thing[], x: number, y: number, r: number) =>
  items.filter((t) => (t.x - x) ** 2 + (t.y - y) ** 2 <= r * r).map((t) => t.id);

describe("SpatialHash", () => {
  it("finds exactly what a brute-force search finds, for many points and radii", () => {
    const items = scatter(500);
    const grid = new SpatialHash<Thing>(24);
    grid.rebuild(items);
    expect(grid.size).toBe(500);
    const random = new Random(9);
    for (let i = 0; i < 200; i++) {
      const x = random.range(-450, 450);
      const y = random.range(-450, 450);
      const r = random.range(0, 120);
      const found: number[] = [];
      grid.near(x, y, r, (t) => {
        found.push(t.id);
      });
      expect(found.sort((a, b) => a - b)).toEqual(within(items, x, y, r));
      const best = grid.nearest(x, y, r);
      const brute = within(items, x, y, r)
        .map((id) => items[id] as Thing)
        .sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2))[0];
      expect(best?.id).toBe(brute?.id);
    }
  });

  it("visits in the same order every time, for deterministic replays", () => {
    const items = scatter(200, 3);
    const order = () => {
      const grid = new SpatialHash<Thing>(16);
      grid.rebuild(items);
      const ids: number[] = [];
      grid.near(0, 0, 150, (t) => {
        ids.push(t.id);
      });
      return ids;
    };
    expect(order()).toEqual(order());
  });

  it("stops when visit returns true, and passes the squared distance", () => {
    const grid = new SpatialHash<Thing>(10);
    grid.rebuild([
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 3, y: 4 },
      { id: 2, x: 1, y: 1 },
    ]);
    const seen: [number, number][] = [];
    const stopped = grid.near(0, 0, 10, (t, d2) => {
      seen.push([t.id, d2]);
      return t.id === 0;
    });
    expect(stopped).toBe(true);
    expect(seen).toEqual([[0, 0]]);
    expect(grid.near(0, 0, 10, () => undefined)).toBe(false);
  });

  it("nearest skips what accept refuses", () => {
    const grid = new SpatialHash<Thing & { dead: boolean }>(10);
    grid.rebuild([
      { id: 0, x: 1, y: 0, dead: true },
      { id: 1, x: 5, y: 0, dead: false },
    ]);
    expect(grid.nearest(0, 0, 20)?.id).toBe(0);
    expect(grid.nearest(0, 0, 20, (t) => !t.dead)?.id).toBe(1);
    expect(grid.nearest(0, 0, 2, (t) => !t.dead)).toBeUndefined();
  });

  it("allows queries inside a query, as a crowd pushing apart does", () => {
    const items = scatter(60, 5, 50);
    const grid = new SpatialHash<Thing>(12);
    grid.rebuild(items);
    let pairs = 0;
    for (const a of items)
      grid.near(a.x, a.y, 10, (b) => {
        if (b !== a) grid.near(b.x, b.y, 10, () => void pairs++);
      });
    expect(pairs).toBeGreaterThan(0);
  });

  it("releases cells that stay empty for a whole fill, so a wandering world doesn't grow it", () => {
    const grid = new SpatialHash<Thing>(8);
    const cells = () => (grid as unknown as { cells: Map<number, unknown> }).cells.size;
    grid.rebuild(scatter(300, 1, 2000));
    const spread = cells();
    expect(spread).toBeGreaterThan(250);
    // The old cells are kept for one fill (most refill), then released once they stayed empty.
    grid.rebuild([{ id: 0, x: 0, y: 0 }]);
    grid.rebuild([{ id: 0, x: 0, y: 0 }]);
    expect(cells()).toBe(1);
    for (let seed = 2; seed < 12; seed++) grid.rebuild(scatter(300, seed, 2000));
    expect(cells()).toBeLessThanOrEqual(spread * 2 + 10);
    grid.clear();
    grid.clear();
    expect(cells()).toBe(0);
    expect(grid.size).toBe(0);
  });

  it("handles negative coordinates, cell borders and points far outside the key range", () => {
    const grid = new SpatialHash<Thing>(10);
    const far = { id: 3, x: 1e12, y: -1e12 };
    grid.rebuild([{ id: 0, x: -10, y: -10 }, { id: 1, x: 0, y: 0 }, { id: 2, x: 9.999, y: 0 }, far]);
    expect(within([{ id: 0, x: -10, y: -10 }], -5, -5, 8)).toEqual([0]);
    const found: number[] = [];
    grid.near(-5, -5, 8, (t) => void found.push(t.id));
    expect(found).toEqual([0, 1]);
    expect(grid.nearest(1e12, -1e12, 1)).toBe(far);
  });

  it("rejects a cell size that isn't a positive number", () => {
    expect(() => new SpatialHash(0)).toThrow(RangeError);
    expect(() => new SpatialHash(Number.NaN)).toThrow(/cellSize/);
  });
});
