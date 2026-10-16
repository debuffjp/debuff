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
});
