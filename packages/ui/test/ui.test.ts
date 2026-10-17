import { describe, expect, it, vi } from "vitest";
import { type DrawLike, Menu, panel, Transition } from "../src/index.js";

function recorder() {
  const calls: { op: string; args: unknown[]; alpha: number }[] = [];
  const draw: DrawLike = {
    alpha: 1,
    rect: (...args) => calls.push({ op: "rect", args, alpha: draw.alpha }),
    text: (...args) => calls.push({ op: "text", args, alpha: draw.alpha }),
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

  it("draws a row per item with the cursor on the focused one", () => {
    const { draw, calls } = recorder();
    const menu = new Menu([{ label: "play" }, { label: "quit", disabled: true }]);
    menu.draw(draw, 10, 20, { lineHeight: 10, focusColor: "#fff", disabledColor: "#333" });
    expect(calls.map((c) => c.args[0])).toEqual(["> play", "  quit"]);
    expect(calls[1]?.args.slice(1, 3)).toEqual([10, 30]);
    expect((calls[1]?.args[3] as { color: string } | undefined)?.color).toBe("#333");
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
