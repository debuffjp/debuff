import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Backend, ClipRect, Matrix, TextureSource } from "../src/backend.js";
import { Draw } from "../src/draw.js";
import { toRGBA } from "../src/index.js";

interface Quad {
  m: Matrix;
  src: TextureSource | null;
  uv: readonly number[];
  color: number;
  flash: number;
  smooth: boolean;
}

function recorder() {
  const quads: Quad[] = [];
  const blends: string[] = [];
  const clips: (ClipRect | null)[] = [];
  const backend: Backend = {
    kind: "2d",
    raw: { kind: "2d", ctx: {} as CanvasRenderingContext2D },
    begin: () => {},
    quad: (m, src, sx, sy, sw, sh, color, flash, smooth) =>
      quads.push({ m: [...m] as Matrix, src, uv: [sx, sy, sw, sh], color, flash, smooth }),
    setBlend: (mode) => blends.push(mode),
    setClip: (rect) => clips.push(rect),
    end: () => {},
    resize: () => {},
    invalidate: () => {},
    dispose: () => {},
  };
  const draw = new Draw(backend, false);
  draw.begin("#000", 100, 100, 1);
  const quad = (i: number): Quad => {
    const q = quads[i];
    if (!q) throw new Error(`no quad ${i}`);
    return q;
  };
  return { draw, quads, quad, blends, clips };
}

/** Where the unit square's corner (u, v) lands. */
const at = (m: Matrix, u: number, v: number) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];

describe("toRGBA", () => {
  it("parses hex forms and passes numbers through", () => {
    expect(toRGBA("#cffb2d")).toBe(0xcffb2dff);
    expect(toRGBA("#fff")).toBe(0xffffffff);
    expect(toRGBA("#11223344")).toBe(0x11223344);
    expect(toRGBA(0x01020304)).toBe(0x01020304);
  });
});

describe("Draw", () => {
  it("puts unrotated pixel-art sprites on whole pixels, but not smooth or rotated ones", () => {
    const { draw, quad } = recorder();
    const frame = { image: {} as TextureSource, x: 0, y: 0, w: 8, h: 8 };
    draw.sprite(frame, 10.4, 20.6);
    draw.sprite(frame, 10.4, 20.6, { smooth: true });
    draw.sprite(frame, 10.4, 20.6, { rotation: 0.5 });
    expect(at(quad(0).m, 0, 0)).toEqual([6, 17]);
    expect(at(quad(1).m, 0, 0)[0]).toBeCloseTo(6.4);
    expect(Number.isInteger(at(quad(2).m, 0, 0)[0])).toBe(false);
  });

  it("maps rects onto the unit square", () => {
    const { draw, quad } = recorder();
    draw.rect(10, 20, 30, 40, "#ff0000");
    expect(at(quad(0).m, 0, 0)).toEqual([10, 20]);
    expect(at(quad(0).m, 1, 1)).toEqual([40, 60]);
    expect(quad(0).src).toBeNull();
    expect(quad(0).color).toBe(0xff0000ff);
  });

  it("composes push/translate/scale/pop and throws on unbalanced pop", () => {
    const { draw, quad } = recorder();
    draw.push();
    draw.translate(50, 50);
    draw.scale(2);
    draw.rect(0, 0, 1, 1, "#fff");
    draw.pop();
    draw.rect(0, 0, 1, 1, "#fff");
    expect(at(quad(0).m, 1, 1)).toEqual([52, 52]);
    expect(at(quad(1).m, 1, 1)).toEqual([1, 1]);
    expect(() => draw.pop()).toThrow(/without a matching push/);
  });

  it("anchors, flips and rotates sprites, passing source rect, flash and filtering", () => {
    const { draw, quad } = recorder();
    const image = { width: 64, height: 64 } as unknown as TextureSource;
    draw.sprite({ image, x: 16, y: 0, w: 16, h: 8 }, 100, 100, { origin: [0.5, 1], flipX: true, flash: 0.5 });
    const q = quad(0);
    expect(q.uv).toEqual([16, 0, 16, 8]);
    expect(at(q.m, 0, 0)).toEqual([108, 92]); // flipped: left edge maps to the right
    expect(at(q.m, 1, 1)).toEqual([92, 100]);
    expect(q.flash).toBe(0.5);
    expect(q.smooth).toBe(false);
    draw.sprite({ image, x: 0, y: 0, w: 10, h: 10 }, 0, 0, { rotation: Math.PI / 2 });
    const [x, y] = at(quad(1).m, 0, 0);
    expect(x).toBeCloseTo(5);
    expect(y).toBeCloseTo(-5);
  });

  it("multiplies global and per-draw alpha into the colour", () => {
    const { draw, quad } = recorder();
    draw.alpha = 0.5;
    draw.sprite({ image: {} as TextureSource, x: 0, y: 0, w: 1, h: 1 }, 0, 0, { alpha: 0.5 });
    expect(quad(0).color & 0xff).toBe(64);
  });

  it("applies the camera view and restores afterwards", () => {
    const { draw, quad } = recorder();
    // What a centred 100x100 camera at (200, 50) returns.
    const camera = { view: (): Matrix => [1, 0, 0, 1, 50 - 200, 50 - 50] };
    draw.withCamera(camera, () => draw.rect(200, 50, 1, 1, "#fff"));
    draw.rect(0, 0, 1, 1, "#fff");
    expect(at(quad(0).m, 0, 0)).toEqual([50, 50]);
    expect(at(quad(1).m, 0, 0)).toEqual([0, 0]);
  });

  it("draws lines as rotated rects and forwards blend modes", () => {
    const { draw, quad, blends } = recorder();
    draw.blend("add");
    draw.line(0, 0, 0, 10, 2, "#fff");
    const [x, y] = at(quad(0).m, 1, 0.5);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(10);
    expect(blends.at(-1)).toBe("add");
  });
});

describe("Draw.clip", () => {
  it("clips in backing pixels, intersects nested clips and restores", () => {
    const { draw, clips } = recorder();
    draw.renderScale = 2;
    draw.translate(10, 0);
    draw.clip(0, 0, 50, 40, () => {
      draw.clip(30, 20, 100, 100, () => {});
    });
    expect(clips).toEqual([{ x: 20, y: 0, w: 100, h: 80 }, { x: 80, y: 40, w: 40, h: 40 }, { x: 20, y: 0, w: 100, h: 80 }, null]);
  });

  it("restores the clip even if the callback throws", () => {
    const { draw, clips } = recorder();
    expect(() =>
      draw.clip(0, 0, 10, 10, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(clips.at(-1)).toBeNull();
  });
});

describe("text cache", () => {
  // A stand-in OffscreenCanvas: enough 2D context for measuring and filling text.
  beforeEach(() => {
    const ctx = {
      font: "",
      fillStyle: "",
      textBaseline: "",
      scale() {},
      fillText() {},
      setTransform() {},
      clearRect() {},
      drawImage() {},
      measureText: (t: string) => ({ width: t.length * 8, fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4 }),
    };
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          public width: number,
          public height: number,
        ) {}
        getContext() {
          return ctx;
        }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps every string on screen, however many, instead of re-rasterising them each frame", () => {
    const evicted: TextureSource[] = [];
    const { draw, quads } = recorder();
    (draw as unknown as { backend: Backend }).backend.invalidate = (src) => evicted.push(src);
    const frame = () => {
      draw.begin("#000", 100, 100, 1);
      for (let i = 0; i < 600; i++) draw.text(String(i), 0, 0);
    };
    frame();
    frame();
    frame();
    // 600 distinct strings a frame, well over the 256 floor: none evicted while they're still drawn.
    expect(evicted).toHaveLength(0);
    // Each frame drew the same 600 cached canvases.
    expect(quads[0]?.src).toBe(quads[600]?.src);
    expect(quads[0]?.src).toBe(quads[1200]?.src);
  });

  it("still evicts strings that left the screen", () => {
    const evicted: TextureSource[] = [];
    const { draw } = recorder();
    (draw as unknown as { backend: Backend }).backend.invalidate = (src) => evicted.push(src);
    for (let f = 0; f < 4; f++) {
      draw.begin("#000", 100, 100, 1);
      for (let i = 0; i < 200; i++) draw.text(`${f}:${i}`, 0, 0);
    }
    expect(evicted.length).toBeGreaterThan(0);
  });
  /** A recorder whose backend can upload regions, so text goes into atlas pages (the WebGL2 path). */
  const atlas = () => {
    const r = recorder();
    const updates: { dst: TextureSource; x: number; y: number; w: number; h: number }[] = [];
    (r.draw as unknown as { backend: Backend }).backend.update = (dst, x, y, _from, w, h) => updates.push({ dst, x, y, w, h });
    return { ...r, updates };
  };

  it("packs strings into shared pages and uploads only each new string's rectangle", () => {
    const { draw, quads, updates } = atlas();
    for (let f = 0; f < 2; f++) {
      draw.begin("#000", 100, 100, 1);
      for (let i = 0; i < 600; i++) draw.text(String(i), 0, 0);
    }
    // One upload per new string, none for strings already cached.
    expect(updates).toHaveLength(600);
    // 600 short strings fit on one page, so they all share one texture (one batch).
    expect(new Set(quads.map((q) => q.src)).size).toBe(1);
    // No two strings overlap on the page.
    const rects = updates.map((u) => [u.x, u.y, u.x + u.w, u.y + u.h]);
    const overlap = rects.some((a, i) => rects.some((b, j) => i !== j && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]));
    expect(overlap).toBe(false);
    // Each quad reads its string's rectangle.
    expect(quads[0]?.uv).toEqual([updates[0]?.x, updates[0]?.y, updates[0]?.w, updates[0]?.h]);
  });

  it("recycles pages whose strings left the screen, and never one still on it", () => {
    const { draw, quads, updates } = atlas();
    for (let f = 0; f < 40; f++) {
      draw.begin("#000", 100, 100, 1);
      // 4,000 new strings a frame: more than a page holds, so pages fill and must be recycled.
      for (let i = 0; i < 4000; i++) draw.text(`${f}:${i}`, 0, 0);
    }
    const pages = new Set(updates.map((u) => u.dst));
    // Bounded: about five pages a frame, and this frame's and last frame's must stay, so about ten in all,
    // rather than five more every frame.
    expect(pages.size).toBeLessThanOrEqual(12);
    // Within the last frame, no rectangle was written twice (a recycled page never held a string drawn that frame).
    const last = updates.slice(-4000).map((u) => `${String(pages.size && [...pages].indexOf(u.dst))}:${u.x}:${u.y}`);
    expect(new Set(last).size).toBe(last.length);
    expect(quads.length).toBe(160000);
  });
});
