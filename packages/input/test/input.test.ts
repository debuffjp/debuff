import { afterEach, describe, expect, it, vi } from "vitest";
import { Gamepads, Input, Keyboard } from "../src/index.js";

function host() {
  const hooks = new Set<() => void>();
  const canvas = document.createElement("canvas");
  return {
    canvas,
    toLogical: (x: number, y: number) => ({ x: x / 2, y: y / 2 }),
    hooks: {
      afterUpdate: (h: () => void) => {
        hooks.add(h);
        return () => {
          hooks.delete(h);
        };
      },
    },
    endStep: () => {
      for (const h of hooks) h();
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Keyboard", () => {
  it("latches a tap shorter than a step until endStep", () => {
    const k = new Keyboard();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    expect(k.down("Space")).toBe(false);
    expect(k.pressed("Space")).toBe(true);
    expect(k.released("Space")).toBe(true);
    k.endStep();
    expect(k.pressed("Space")).toBe(false);
    k.dispose();
  });

  it("ignores auto-repeat and releases everything on blur", () => {
    const k = new Keyboard();
    k.press("KeyA");
    k.endStep();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", repeat: true }));
    expect(k.pressed("KeyA")).toBe(false);
    window.dispatchEvent(new Event("blur"));
    expect(k.down("KeyA")).toBe(false);
    k.dispose();
  });
});

describe("Input", () => {
  it("maps actions across keyboard and pointer, and clears edges after each step", () => {
    const h = host();
    const input = new Input(h, { bindings: { left: ["ArrowLeft"], right: ["ArrowRight", "KeyD"], jump: ["Space", "Pointer"] } });
    input.keys.press("KeyD");
    expect(input.axis("left", "right")).toBe(1);
    input.pointer.press(10, 10);
    expect(input.pressed("jump")).toBe(true);
    expect(input.down("jump")).toBe(true);
    h.endStep();
    expect(input.pressed("jump")).toBe(false);
    input.pointer.release();
    expect(input.released("jump")).toBe(true);
    input.dispose();
  });

  it("reports unknown actions helpfully", () => {
    const input = new Input(host(), { bindings: { jump: ["Space"] } });
    expect(() => input.down("fly" as "jump")).toThrow(/Unknown input action "fly". Known: jump/);
    input.dispose();
  });

  it("maps pointer events to logical coordinates", () => {
    const h = host();
    const input = new Input(h, { bindings: { tap: ["Pointer"] } });
    h.canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 40, isPrimary: true, pointerId: 1 }));
    expect(input.pointer).toMatchObject({ x: 50, y: 20, down: true, pressed: true });
    expect(input.pointer.touches.size).toBe(1);
    h.canvas.dispatchEvent(new PointerEvent("pointerup", { isPrimary: true, pointerId: 1 }));
    expect(input.pointer.down).toBe(false);
    expect(input.pointer.touches.size).toBe(0);
    input.dispose();
  });

  it("reads gamepads through the standard mapping with stick deadzone", () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
    const pad = { connected: true, buttons, axes: [-0.9, 0.1] };
    vi.stubGlobal("navigator", { getGamepads: () => [pad] });
    const h = host();
    const input = new Input(h, { bindings: { left: ["PadStickLeft"], jump: ["PadA"] } });
    h.endStep(); // poll
    expect(input.down("left")).toBe(true);
    expect(input.down("jump")).toBe(false);
    buttons[0] = { pressed: true };
    h.endStep();
    expect(input.pressed("jump")).toBe(true);
    h.endStep();
    expect(input.pressed("jump")).toBe(false);
    expect(input.down("jump")).toBe(true);
    input.dispose();
  });
});

describe("Gamepads", () => {
  it("is inert without the Gamepad API", () => {
    vi.stubGlobal("navigator", {});
    const g = new Gamepads();
    g.poll();
    expect(g.connected).toBe(false);
  });

  it("is inert, and stops asking, when a permissions policy blocks the Gamepad API", () => {
    const getGamepads = vi.fn(() => {
      throw new DOMException('Access to the feature "gamepad" is disallowed by permissions policy.', "SecurityError");
    });
    vi.stubGlobal("navigator", { getGamepads });
    const g = new Gamepads();
    g.poll();
    g.poll();
    expect(g.connected).toBe(false);
    expect(getGamepads).toHaveBeenCalledTimes(1);
  });
});

describe("embedding", () => {
  it("blocks scrolling for bound keys, except while typing in a field", () => {
    const input = new Input(host(), { bindings: { jump: ["Space"], left: ["ArrowLeft", "PadLeft"] } });
    expect([...input.keys.captured].sort()).toEqual(["ArrowLeft", "Space"]);
    const space = new KeyboardEvent("keydown", { code: "Space", cancelable: true });
    window.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    const field = document.createElement("input");
    document.body.append(field);
    const typed = new KeyboardEvent("keydown", { code: "Space", cancelable: true, bubbles: true });
    field.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
    const unbound = new KeyboardEvent("keydown", { code: "KeyQ", cancelable: true });
    window.dispatchEvent(unbound);
    expect(unbound.defaultPrevented).toBe(false);
    field.remove();
    input.dispose();
  });

  it("can opt out, and suppresses the canvas context menu", () => {
    const h = host();
    const input = new Input(h, { bindings: { jump: ["Space"] }, captureKeys: false });
    expect(input.keys.captured.size).toBe(0);
    const menu = new Event("contextmenu", { cancelable: true });
    h.canvas.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    input.dispose();
  });
});

describe("Input with a class host", () => {
  it("calls toLogical with its own this (regression: pointer moves threw)", () => {
    class Host {
      readonly canvas = document.createElement("canvas");
      readonly scale = 2;
      readonly hooks = host().hooks;
      toLogical(x: number, y: number) {
        return { x: x / this.scale, y: y / this.scale };
      }
    }
    const h = new Host();
    const input = new Input(h, { bindings: {} });
    expect(() => h.canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: 40, clientY: 20, isPrimary: true }))).not.toThrow();
    expect(input.pointer.x).toBe(20);
    expect(input.pointer.y).toBe(10);
    input.dispose();
  });
});

describe("Gamepads.fed", () => {
  it("reads fed state instead of the Gamepad API, and goes back when cleared", () => {
    vi.stubGlobal("navigator", { getGamepads: () => [{ connected: true, buttons: [{ pressed: true }], axes: [0, 0] }] });
    const pads = new Gamepads();
    pads.fed = { buttons: [{ pressed: false }, { pressed: true }], axes: [-0.75, 0] };
    pads.poll();
    expect([pads.down("PadA"), pads.down("PadB"), pads.down("PadStickLeft"), pads.stickX]).toEqual([false, true, true, -0.75]);
    pads.fed = null;
    pads.poll();
    expect([pads.connected, pads.down("PadB")]).toEqual([false, false]);
    pads.fed = undefined;
    pads.poll();
    expect([pads.connected, pads.down("PadA")]).toEqual([true, true]);
  });
});

describe("input regressions", () => {
  it("ignores non-primary mouse buttons for Pointer", () => {
    const h = host();
    const input = new Input(h, { bindings: { tap: ["Pointer"] } });
    const ev = (type: string, button: number) =>
      new PointerEvent(type, { isPrimary: true, pointerId: 1, pointerType: "mouse", button, cancelable: true });
    h.canvas.dispatchEvent(ev("pointerdown", 2));
    h.canvas.dispatchEvent(ev("pointerdown", 1));
    expect(input.down("tap")).toBe(false);
    h.canvas.dispatchEvent(ev("pointerdown", 0));
    expect(input.down("tap")).toBe(true);
    h.canvas.dispatchEvent(ev("pointerup", 0));
    expect(input.down("tap")).toBe(false);
    input.dispose();
  });

  it("releases keys held on an element target when focus leaves it", () => {
    const el = document.createElement("div");
    document.body.append(el);
    const k = new Keyboard(el);
    el.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(k.down("KeyD")).toBe(true);
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(k.down("KeyD")).toBe(false);
    expect(k.released("KeyD")).toBe(true);
    k.dispose();
    el.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(k.down("KeyD")).toBe(false);
    el.remove();
  });
});

describe("wheel", () => {
  it("sums wheel deltas over a step in pixels, and resets them after it", () => {
    const h = host();
    const input = new Input(h, { bindings: {} });
    h.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 30, cancelable: true }));
    h.canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 2, deltaX: -1, deltaMode: 1, cancelable: true }));
    expect([input.pointer.wheel, input.pointer.wheelX]).toEqual([62, -16]);
    h.endStep();
    expect([input.pointer.wheel, input.pointer.wheelX]).toEqual([0, 0]);
    input.pointer.scroll(-120);
    expect(input.pointer.wheel).toBe(-120);
    input.dispose();
  });

  it("leaves page scrolling alone unless captureWheel is set", () => {
    const h = host();
    const free = new Input(h, { bindings: {} });
    const a = new WheelEvent("wheel", { deltaY: 10, cancelable: true });
    h.canvas.dispatchEvent(a);
    expect(a.defaultPrevented).toBe(false);
    free.dispose();
    const zoomer = new Input(h, { bindings: {}, captureWheel: true });
    const b = new WheelEvent("wheel", { deltaY: 10, cancelable: true });
    h.canvas.dispatchEvent(b);
    expect(b.defaultPrevented).toBe(true);
    zoomer.dispose();
  });
});

describe("right and middle buttons", () => {
  const mouse = (type: string, button: number, buttons: number) =>
    new PointerEvent(type, { isPrimary: true, pointerId: 1, pointerType: "mouse", button, buttons, cancelable: true });

  it("binds PointerRight and PointerMiddle, with edges, apart from the primary pointer", () => {
    const h = host();
    const input = new Input(h, { bindings: { remove: ["PointerRight", "KeyX"], pan: ["PointerMiddle"], place: ["Pointer"] } });
    expect([...input.keys.captured]).toEqual(["KeyX"]);
    h.canvas.dispatchEvent(mouse("pointerdown", 2, 2));
    expect([input.down("remove"), input.pressed("remove"), input.down("place")]).toEqual([true, true, false]);
    h.endStep();
    expect([input.down("remove"), input.pressed("remove")]).toEqual([true, false]);
    // Middle pressed while right is held: browsers send a move with the changed button.
    h.canvas.dispatchEvent(mouse("pointermove", 1, 6));
    expect(input.pressed("pan")).toBe(true);
    h.canvas.dispatchEvent(mouse("pointermove", 2, 4));
    expect([input.released("remove"), input.down("pan")]).toEqual([true, true]);
    h.canvas.dispatchEvent(mouse("pointerup", 1, 0));
    expect(input.released("pan")).toBe(true);
    input.dispose();
  });

  it("can be simulated, and plain moves don't release a simulated button", () => {
    const h = host();
    const input = new Input(h, { bindings: { remove: ["PointerRight"] } });
    input.pointer.pressButton("right");
    h.canvas.dispatchEvent(mouse("pointermove", -1, 0));
    expect(input.down("remove")).toBe(true);
    input.pointer.releaseButton("right");
    expect(input.released("remove")).toBe(true);
    input.dispose();
  });
});

describe("pointer kind and touches", () => {
  const touch = (type: string, id: number, x: number, isPrimary: boolean) =>
    new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: 0, isPrimary, buttons: 1, cancelable: true });

  it("reports the kind of the latest press, and contacts that started and ended this step", () => {
    const h = host();
    const input = new Input(h, { bindings: { tap: ["Pointer"] } });
    expect(input.pointer.kind).toBe("mouse");
    h.canvas.dispatchEvent(touch("pointerdown", 5, 20, true));
    h.canvas.dispatchEvent(touch("pointerdown", 6, 40, false));
    expect(input.pointer).toMatchObject({ kind: "touch", x: 10, down: true });
    expect(input.pointer.touchesStarted.map((t) => [t.id, t.x, t.kind])).toEqual([
      [5, 10, "touch"],
      [6, 20, "touch"],
    ]);
    h.endStep();
    expect(input.pointer.touchesStarted).toEqual([]);
    h.canvas.dispatchEvent(touch("pointermove", 6, 60, false));
    expect([input.pointer.touches.get(6)?.x, input.pointer.x]).toEqual([30, 10]);
    h.canvas.dispatchEvent(touch("pointerup", 6, 60, false));
    expect(input.pointer.touchesEnded.map((t) => [t.id, t.x])).toEqual([[6, 30]]);
    expect(input.pointer.down).toBe(true);
    h.canvas.dispatchEvent(touch("pointerup", 5, 20, true));
    expect(input.pointer.down).toBe(false);
    h.canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 9, pointerType: "pen", isPrimary: true, cancelable: true }));
    expect(input.pointer.kind).toBe("pen");
    input.dispose();
  });

  it("simulates touches through the same paths, with the first contact as the primary pointer", () => {
    const h = host();
    const input = new Input(h, { bindings: { tap: ["Pointer"] } });
    const p = input.pointer;
    p.touchStart(1, 10, 10);
    p.touchStart(2, 50, 50);
    expect([p.pressed, p.kind, p.touches.size, p.touchesStarted.length]).toEqual([true, "touch", 2, 2]);
    p.touchMove(1, 12, 14);
    p.touchMove(2, 90, 90);
    expect([p.x, p.y]).toEqual([12, 14]);
    p.touchEnd(1);
    expect([p.released, p.touches.size]).toEqual([true, 1]);
    p.touchEnd(1); // already ended
    expect(p.touchesEnded.length).toBe(1);
    p.press(1, 1);
    expect(p.kind).toBe("mouse");
    input.dispose();
  });

  it("keeps a mouse hover moving the primary pointer, and a held mouse in touches", () => {
    const h = host();
    const input = new Input(h, { bindings: {} });
    const mouse = (type: string, x: number, buttons: number) =>
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        clientX: x,
        clientY: 0,
        buttons,
        button: 0,
        cancelable: true,
      });
    h.canvas.dispatchEvent(mouse("pointermove", 8, 0));
    expect([input.pointer.x, input.pointer.touches.size]).toEqual([4, 0]);
    h.canvas.dispatchEvent(mouse("pointerdown", 10, 1));
    h.canvas.dispatchEvent(mouse("pointermove", 30, 1));
    expect([input.pointer.x, input.pointer.touches.get(1)?.kind, input.pointer.kind]).toEqual([15, "mouse", "mouse"]);
    h.canvas.dispatchEvent(mouse("pointerup", 30, 0));
    expect([input.pointer.down, input.pointer.touches.size]).toEqual([false, 0]);
    input.dispose();
  });
});

describe("rebind", () => {
  it("replaces an action's keys and keeps captured keys in step", () => {
    const h = host();
    const bindings = { jump: ["Space", "PadA"], left: ["ArrowLeft"] };
    const input = new Input(h, { bindings });
    input.keys.captured.add("Tab"); // the game's own
    const keys = ["KeyK", "PadA"];
    input.rebind("jump", keys);
    keys.push("KeyL"); // the caller's array stays theirs
    expect(input.bindings.jump).toEqual(["KeyK", "PadA"]);
    expect(bindings.jump).toEqual(["Space", "PadA"]);
    expect([...input.keys.captured].sort()).toEqual(["ArrowLeft", "KeyK", "Tab"]);
    input.keys.press("Space");
    expect(input.down("jump")).toBe(false);
    input.keys.press("KeyK");
    expect(input.pressed("jump")).toBe(true);
    const space = new KeyboardEvent("keydown", { code: "Space", cancelable: true });
    window.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    expect(() => input.rebind("fly" as "jump", [])).toThrow(/Unknown input action "fly"/);
    input.dispose();
  });

  it("captures nothing when captureKeys is off", () => {
    const input = new Input(host(), { bindings: { jump: ["Space"] }, captureKeys: false });
    input.rebind("jump", ["KeyK"]);
    expect(input.keys.captured.size).toBe(0);
    input.dispose();
  });
});
