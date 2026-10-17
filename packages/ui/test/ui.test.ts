import { describe, expect, it, vi } from "vitest";
import { type DrawLike, Menu, panel, panelAround, Transition } from "../src/index.js";

function recorder() {
  const calls: { op: string; args: unknown[]; alpha: number }[] = [];
  const draw: DrawLike = {
    alpha: 1,
    rect: (...args) => calls.push({ op: "rect", args, alpha: draw.alpha }),
    text: (...args) => calls.push({ op: "text", args, alpha: draw.alpha }),
    // Fake metrics: 5px per character, 10px tall.
    measure: (t) => ({ w: t.length * 5, h: 10 }),
  };
  return { draw, calls };
}

const keys = (held: string[]) => ({ pressed: (a: string) => held.includes(a) });

describe("Transition", () => {
  it("covers, swaps once at full cover, then uncovers", () => {
    const fade = new Transition({ duration: 1 });
    const swap = vi.fn();
    expect(fade.run(swap)).toBe(true);
    expect(fade.run(swap)).toBe(false);
    fade.update(0.5);
    expect(fade.cover).toBeCloseTo(0.5);
    expect(fade.blocking).toBe(true);
    expect(swap).not.toHaveBeenCalled();
    fade.update(0.6);
    expect(swap).toHaveBeenCalledTimes(1);
    expect(fade.blocking).toBe(false);
    expect(fade.cover).toBeCloseTo(0.9);
    fade.update(1);
    expect(fade.active).toBe(false);
    expect(fade.cover).toBe(0);
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it("swaps even when one step jumps past the end", () => {
    const fade = new Transition({ duration: 0.1 });
    const swap = vi.fn();
    fade.run(swap);
    fade.update(5);
    expect(swap).toHaveBeenCalledTimes(1);
    expect(fade.active).toBe(false);
  });

  it("stop cancels without swapping", () => {
    const fade = new Transition();
    const swap = vi.fn();
    fade.run(swap);
    fade.stop();
    fade.update(10);
    expect(swap).not.toHaveBeenCalled();
    expect(fade.run()).toBe(true);
  });

  it("draws with the cover as alpha and restores alpha", () => {
    const { draw, calls } = recorder();
    const fade = new Transition({ duration: 1, color: "#123" });
    fade.draw(draw, 0, 0, 10, 10);
    expect(calls).toHaveLength(0);
    fade.run();
    fade.update(0.25);
    fade.draw(draw, 0, 0, 10, 10);
    expect(calls[0]).toEqual({ op: "rect", args: [0, 0, 10, 10, "#123"], alpha: 0.25 });
    expect(draw.alpha).toBe(1);
    expect(fade.inspect()).toEqual({ active: true, cover: 0.25 });
  });
});

describe("Menu", () => {
  it("navigates, wraps and skips disabled items", () => {
    const menu = new Menu([{ label: "a" }, { label: "b", disabled: true }, { label: "c" }]);
    expect(menu.focused?.label).toBe("a");
    menu.update(keys(["down"]));
    expect(menu.focused?.label).toBe("c");
    menu.update(keys(["down"]));
    expect(menu.focused?.label).toBe("a");
    menu.update(keys(["up"]));
    expect(menu.focused?.label).toBe("c");
    expect(menu.update(keys([]))).toBe(false);
  });

  it("stops at the ends without wrap and starts past a disabled first item", () => {
    const menu = new Menu([{ label: "x", disabled: true }, { label: "a" }, { label: "b" }], { wrap: false });
    expect(menu.focused?.label).toBe("a");
    menu.move(-1);
    expect(menu.focused?.label).toBe("a");
    menu.move(1);
    menu.move(1);
    expect(menu.focused?.label).toBe("b");
  });

  it("selects and goes back with custom actions", () => {
    const go = vi.fn();
    const back = vi.fn();
    const menu = new Menu([{ label: "go", onSelect: go }], { actions: { up: "u", down: "d", confirm: "jump", back: "esc" }, onBack: back });
    menu.update(keys(["jump"]));
    menu.update(keys(["esc"]));
    expect(go).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("does nothing when empty", () => {
    const menu = new Menu([]);
    menu.move(1);
    menu.select();
    expect(menu.inspect()).toEqual({ focus: 0, focused: undefined, items: [] });
  });

  it("left-aligns labels after a fixed cursor column, on whole pixels", () => {
    const { draw, calls } = recorder();
    const menu = new Menu([{ label: "play" }, { label: "quit", disabled: true }]);
    menu.draw(draw, 10.4, 20.6, { gap: 2, disabledColor: "#333" });
    // cursor ">" is 5px wide + 4px gap → labels at x 19; rows 10px + 2px gap.
    expect(calls.map((c) => c.args.slice(0, 3))).toEqual([
      ["play", 19, 21],
      [">", 10, 21],
      ["quit", 19, 33],
    ]);
    expect((calls[2]?.args[3] as { color: string } | undefined)?.color).toBe("#333");
    expect(menu.measure(draw, { gap: 2 })).toEqual({ w: 29, h: 22 });
  });

  it("centres labels and keeps the cursor beside each one", () => {
    const { draw, calls } = recorder();
    const menu = new Menu([{ label: "ok" }, { label: "cancel" }]);
    menu.focus = 0;
    menu.draw(draw, 0, 0, { align: "center" });
    // labelW 30, gutter 9 each side; "ok" (10px) centred → 9 + 10 = 19, cursor at 10.
    expect(calls[0]?.args.slice(0, 2)).toEqual(["ok", 19]);
    expect(calls[1]?.args.slice(0, 2)).toEqual([">", 10]);
    expect(calls[2]?.args.slice(0, 2)).toEqual(["cancel", 9]);
    expect(menu.measure(draw, { align: "center" }).w).toBe(48);
  });

  it("right-aligns values and changes them with left/right", () => {
    const { draw, calls } = recorder();
    let vol = 5;
    const menu = new Menu([{ label: "volume", value: () => `${vol}`, change: (d) => (vol += d) }, { label: "back" }], {
      actions: { up: "u", down: "d", confirm: "c", left: "l", right: "r" },
    });
    menu.update(keys(["r"]));
    menu.update(keys(["r"]));
    menu.update(keys(["l"]));
    expect(vol).toBe(6);
    menu.draw(draw, 0, 0);
    // w = 9 + 30 + 12 + 5 = 56; value "6" at 56 - 5.
    expect(calls.find((c) => c.args[0] === "6")?.args[1]).toBe(51);
  });

  it("selects a tapped row and ignores confirm on that step", () => {
    const { draw } = recorder();
    const play = vi.fn();
    const quit = vi.fn();
    let vol = 5;
    const menu = new Menu([
      { label: "play", onSelect: play },
      { label: "quit", onSelect: quit },
      { label: "vol", value: () => `${vol}`, change: (d) => (vol += d) },
      { label: "off", disabled: true },
    ]);
    expect(menu.tap(0, 0)).toBe(false); // nothing drawn yet
    menu.draw(draw, 0, 0); // rows 10px + 3px gap; w = 9 + 15 + 12 + 5 = 41
    const tap = (x: number, y: number) => menu.update({ pressed: () => true, pointer: { x, y, pressed: true } });
    expect(tap(20, 15)).toBe(true);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
    expect(menu.focused?.label).toBe("quit");
    tap(35, 28);
    tap(5, 28);
    tap(5, 28);
    expect(vol).toBe(4);
    expect(tap(5, 41)).toBe(false);
    expect(tap(200, 0)).toBe(false);
  });

  it("draws a titled panel centred on a point", () => {
    const { draw, calls } = recorder();
    const menu = new Menu([{ label: "resume" }]);
    menu.drawPanel(draw, 100, 50, { title: "paused", padding: 4, borders: ["a"], fill: "b" });
    // Cursor column mirrored: content w = 9 + 30 + 9 = 48, h = 10 + 6 + 10 = 26; inset 5 → 58×36 at (71, 32).
    expect(calls[0]?.args).toEqual([71, 32, 58, 36, "a"]);
    // Title and label share a left edge and a centre.
    expect(calls[2]?.args.slice(0, 3)).toEqual(["paused", 85, 37]);
    expect(calls[3]?.args.slice(0, 3)).toEqual(["resume", 85, 53]);
  });
});

describe("panel", () => {
  it("draws nested rings then the fill", () => {
    const { draw, calls } = recorder();
    panel(draw, 0, 0, 10, 8, ["a", "b"], "c");
    expect(calls.map((c) => c.args)).toEqual([
      [0, 0, 10, 8, "a"],
      [1, 1, 8, 6, "b"],
      [2, 2, 6, 4, "c"],
    ]);
  });

  it("stops when the box is too small for more rings", () => {
    const { draw, calls } = recorder();
    panel(draw, 0, 0, 2, 2, ["a", "b", "c"], "d");
    expect(calls).toHaveLength(1);
  });
});

describe("panelAround", () => {
  it("snaps the frame to whole pixels and returns the content origin", () => {
    const { draw, calls } = recorder();
    expect(panelAround(draw, 10.5, 10.5, 5, 5)).toEqual({ x: 8, y: 8 });
    expect(calls[0]?.args.slice(0, 4)).toEqual([1, 1, 19, 19]);
  });
});
