import { Game } from "@debuffjp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { devOverlay } from "../src/index.js";
import { keepOnScreen } from "../src/overlay.js";

// happy-dom reports navigator.webdriver as true, where the overlay starts hidden. Tests play a human unless they say otherwise.
beforeEach(() => {
  vi.spyOn(navigator, "webdriver", "get").mockReturnValue(false);
});

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

  it("starts hidden in automated browsers unless opened explicitly", () => {
    vi.spyOn(navigator, "webdriver", "get").mockReturnValue(true);
    const game = makeGame().use(devOverlay());
    expect(panel()?.hidden).toBe(true);
    game.dispose();
    const opened = makeGame().use(devOverlay({ open: true }));
    expect(panel()?.hidden).toBe(false);
    opened.dispose();
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
  it("drags by the header, remembers the spot, and docks again on a double-click of the mascot", () => {
    localStorage.clear();
    let game = makeGame().use(devOverlay());
    const header = panel()?.firstElementChild as HTMLElement;
    const at = (type: string, x: number, y: number) =>
      header.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true }));
    at("pointerdown", 10, 10);
    at("pointermove", 11, 11); // under the drag threshold: still a click
    expect(panel()?.style.left).toBe("");
    at("pointermove", 210, 110);
    at("pointerup", 210, 110);
    expect([panel()?.style.left, panel()?.style.top, panel()?.style.right]).toEqual(["200px", "100px", "auto"]);
    game.dispose();

    game = makeGame().use(devOverlay());
    expect([panel()?.style.left, panel()?.style.top]).toEqual(["200px", "100px"]);
    const mascot = panel()?.querySelector<HTMLElement>('[aria-label="debuff"]');
    mascot?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect([panel()?.style.left, panel()?.style.right, panel()?.style.top]).toEqual(["", "8px", "8px"]);
    // Docking isn't a collapse, though the mascot sits in the header.
    expect(panel()?.querySelector<HTMLElement>("[data-debuff-overlay] > div:nth-child(2)")?.hidden).toBe(false);
    game.dispose();
  });

  it("doesn't start a drag from the header's buttons", () => {
    localStorage.clear();
    const game = makeGame().use(devOverlay());
    const collapse = panel()?.firstElementChild?.querySelector("button:last-of-type") as HTMLElement;
    collapse.dispatchEvent(new PointerEvent("pointerdown", { clientX: 10, clientY: 10, button: 0, bubbles: true }));
    collapse.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 300, bubbles: true }));
    expect(panel()?.style.left).toBe("");
    game.dispose();
  });

  it("keeps a dragged panel's header on screen", () => {
    expect(keepOnScreen({ x: -500, y: -20 }, 290, 400, 800, 600)).toEqual({ x: -250, y: 0 });
    expect(keepOnScreen({ x: 900, y: 900 }, 290, 400, 800, 600)).toEqual({ x: 760, y: 560 });
    expect(keepOnScreen({ x: 100.4, y: 50.6 }, 290, 400, 800, 600)).toEqual({ x: 100, y: 51 });
  });

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

describe("copyText", () => {
  it("falls back to execCommand where navigator.clipboard is missing (plain HTTP over the LAN)", async () => {
    const { copyText } = await import("../src/overlay.js");
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    let copied: string | undefined;
    document.execCommand = vi.fn(() => {
      copied = (document.activeElement as HTMLTextAreaElement | null)?.value ?? document.querySelector("textarea")?.value;
      return true;
    });
    copyText("state json");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(copied).toBe("state json");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
