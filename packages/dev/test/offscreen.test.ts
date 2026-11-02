import { Game } from "@debuffjp/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OffscreenSampler, offscreenHint } from "../src/offscreen.js";

function makeGame(render: (d: Game["draw"]) => void) {
  const canvas = document.createElement("canvas");
  const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
  vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
    type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
  const game = new Game({ canvas, width: 100, height: 100, scale: "none", splash: false });
  game.add({ id: "play", render }).go("play");
  return game;
}

const image = { width: 8, height: 8 } as unknown as HTMLCanvasElement;
const frame = { image, x: 0, y: 0, w: 8, h: 8 };

describe("OffscreenSampler", () => {
  afterEach(() => vi.restoreAllMocks());

  it("counts sprites outside the view, one by one and in bulk, and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const far = new Float32Array(2400).fill(5000);
    const game = makeGame((d) => {
      d.sprite(frame, 50, 50);
      d.sprite(frame, 5000, 5000);
      d.sprites(frame, far, 1200);
    });
    const sampler = new OffscreenSampler(game);
    game.frame(1 / 60);
    expect(sampler.latest).toMatchObject({ sprites: 1202, offscreen: 1201 });
    for (let i = 0; i < 120; i++) game.frame(1 / 60);
    expect(warn.mock.calls.filter(([m]) => String(m).includes("outside the view"))).toHaveLength(1);
  });

  it("applies the current transform, and counts a sprite the camera brings into view as visible", () => {
    const game = makeGame((d) => {
      d.push();
      d.translate(-5000, -5000);
      d.sprite(frame, 5050, 5050);
      d.pop();
    });
    const sampler = new OffscreenSampler(game);
    game.frame(1 / 60);
    expect(sampler.latest).toMatchObject({ sprites: 1, offscreen: 0 });
  });

  it("leaves the renderer untouched between measured frames", () => {
    const game = makeGame(() => {});
    new OffscreenSampler(game);
    game.frame(1 / 60);
    expect(Object.hasOwn(game.draw, "sprite")).toBe(false);
  });

  it("stays quiet for small counts and for mostly visible frames", () => {
    expect(offscreenHint({ tick: 0, sprites: 900, offscreen: 900 })).toBeUndefined();
    expect(offscreenHint({ tick: 0, sprites: 10000, offscreen: 2000 })).toBeUndefined();
    expect(offscreenHint({ tick: 0, sprites: 2000, offscreen: 1500 })).toContain("camera.sees");
  });
});
