import { Game } from "@debuff/core";
import { describe, expect, it, vi } from "vitest";
import { devOverlay } from "../src/index.js";

function makeGame() {
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue(
    new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined) }) as CanvasRenderingContext2D,
  );
  const game = new Game({ canvas, width: 100, height: 100, scale: "none" });
  game.params.define("player", {
    speed: { type: "number", default: 100, min: 0, max: 400, units: "px/s" },
    ghost: { type: "boolean", default: false },
  });
  return game;
}

const panel = () => document.querySelector<HTMLElement>("[data-debuff-overlay]");

describe("devOverlay", () => {
  it("renders controls for every param group and edits params", () => {
    const game = makeGame().use(devOverlay());
    const slider = panel()?.querySelector<HTMLInputElement>('input[type="range"]');
    const toggle = panel()?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!slider || !toggle) throw new Error("controls missing");
    expect(slider.max).toBe("400");
    slider.value = "250";
    slider.dispatchEvent(new Event("input"));
    expect(game.params.group("player")?.get("speed")).toBe(250);
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(game.params.group("player")?.get("ghost")).toBe(true);
    game.dispose();
  });

  it("reflects changes made elsewhere", () => {
    const game = makeGame().use(devOverlay());
    game.params.group("player")?.set("speed", 42);
    expect(panel()?.querySelector<HTMLInputElement>('input[type="range"]')?.value).toBe("42");
    game.dispose();
  });

  it("toggles with the key and removes itself on dispose", () => {
    const game = makeGame().use(devOverlay({ toggleKey: "F2" }));
    dispatchEvent(new KeyboardEvent("keydown", { code: "F2" }));
    expect(panel()?.hidden).toBe(true);
    expect(game.inspect.snapshot()["dev-overlay"]).toEqual({ open: false });
    game.dispose();
    expect(panel()).toBeNull();
  });
});
