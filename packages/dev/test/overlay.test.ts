import { Game } from "@debuffjp/core";
import { describe, expect, it, vi } from "vitest";
import { devOverlay } from "../src/index.js";

function makeGame() {
  const canvas = document.createElement("canvas");
  const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
  vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
    type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
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
    const slider = panel()?.querySelector<HTMLInputElement>('input[data-param="player.speed"]');
    const toggle = panel()?.querySelector<HTMLInputElement>('input[data-param="player.ghost"]');
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
    expect(panel()?.querySelector<HTMLInputElement>('input[data-param="player.speed"]')?.value).toBe("42");
    game.dispose();
  });

  it("toggles with the key and removes itself on dispose", () => {
    const game = makeGame().use(devOverlay({ toggleKey: "F2" }));
    dispatchEvent(new KeyboardEvent("keydown", { code: "F2" }));
    expect(panel()?.hidden).toBe(true);
    expect(game.inspect.snapshot()["dev-overlay"]).toMatchObject({ open: false });
    game.dispose();
    expect(panel()).toBeNull();
  });
});

describe("devOverlay controls", () => {
  it("logs a slider change as one undoable activity and undoes it", () => {
    const game = makeGame().use(devOverlay());
    const slider = panel()?.querySelector<HTMLInputElement>('input[data-param="player.speed"]');
    if (!slider) throw new Error("slider missing");
    slider.dispatchEvent(new Event("pointerdown"));
    for (const v of ["150", "200", "250"]) {
      slider.value = v;
      slider.dispatchEvent(new Event("input"));
    }
    slider.dispatchEvent(new Event("change"));
    const undo = [...(panel()?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "undo");
    expect(undo).toBeTruthy();
    undo?.click();
    expect(game.params.group("player")?.get("speed")).toBe(100);
    game.dispose();
  });
});

describe("devOverlay collapse", () => {
  it("collapses to the header, remembers it, and expands again", () => {
    localStorage.removeItem("debuff:dev-overlay:collapsed");
    let game = makeGame().use(devOverlay());
    const toggle = () => panel()?.querySelector<HTMLButtonElement>("button[aria-expanded]");
    const body = () => toggle()?.parentElement?.nextElementSibling as HTMLElement | null;
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
    toggle()?.click();
    expect(body()?.hidden).toBe(true);
    expect(game.inspect.snapshot()["dev-overlay"]).toMatchObject({ collapsed: true });
    game.dispose();

    game = makeGame().use(devOverlay());
    expect(body()?.hidden).toBe(true);
    toggle()?.click();
    expect(body()?.hidden).toBe(false);
    game.dispose();
  });
});

describe("devOverlay tabs and tuning", () => {
  it("switches tabs, marks changed params and resets one by double-clicking its name", () => {
    localStorage.clear();
    const game = makeGame().use(devOverlay());
    const tab = (name: string) =>
      [...(panel()?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])].find((b) => b.textContent === name);
    const pane = (name: string) => panel()?.querySelector<HTMLElement>(`[data-tab="${name}"]`);
    expect(pane("perf")?.hidden).toBe(false);
    tab("tune")?.click();
    expect(pane("perf")?.hidden).toBe(true);
    expect(pane("tune")?.hidden).toBe(false);
    expect(game.inspect.snapshot()["dev-overlay"]).toMatchObject({ tab: "tune" });

    game.params.group("player")?.set("speed", 250);
    const slider = panel()?.querySelector<HTMLInputElement>('input[data-param="player.speed"]');
    const name = slider?.previousElementSibling as HTMLElement;
    expect(name.style.color).not.toBe("");
    name.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(game.params.group("player")?.get("speed")).toBe(100);
    expect(name.style.color).toBe("");
    game.dispose();
  });

  it("shows live scene state and runtime errors", () => {
    localStorage.clear();
    const game = makeGame();
    game.add({ id: "play", inspect: () => ({ hp: 7 }) }).go("play");
    game.use(devOverlay());
    const tab = (name: string) =>
      [...(panel()?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])].find((b) => b.textContent === name);
    tab("state")?.click();
    expect(panel()?.querySelector('[data-tab="state"] pre')?.textContent).toContain('"hp": 7');
    dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    const badge = [...(panel()?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "1 error");
    expect(badge?.hidden).toBe(false);
    badge?.click();
    expect(panel()?.querySelector('[data-tab="log"]')?.textContent).toContain("boom");
    game.dispose();
  });
});
