import * as spryte from "spryte";
import { describe, expect, it, vi } from "vitest";
import { Game } from "../src/index.js";
import { fakeCanvas } from "./helpers.js";

vi.mock("../src/splash.js", () => ({ drawSplash: () => {} }));
vi.mock("spryte", async (original) => {
  const mod = await original<typeof import("spryte")>();
  return { ...mod, createRenderer: vi.fn(mod.createRenderer) };
});

describe("Game renderer options", () => {
  it("passes blendSpace to the renderer, and leaves it unset by default", () => {
    const create = vi.mocked(spryte.createRenderer);
    new Game({ canvas: fakeCanvas().canvas, width: 320, height: 180, blendSpace: "linear" });
    expect(create.mock.lastCall?.[1]).toMatchObject({ blendSpace: "linear" });
    new Game({ canvas: fakeCanvas().canvas, width: 320, height: 180 });
    expect(create.mock.lastCall?.[1]?.blendSpace).toBeUndefined();
  });
});
