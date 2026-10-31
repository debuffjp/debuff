import { describe, expect, it } from "vitest";
import { Input, TouchControls, type TouchControlsOptions } from "../src/index.js";

/** A stand-in for `Game`: one step runs beforeUpdate, then afterUpdate (where Input clears its edges). */
function game(width = 320, height = 180) {
  const before = new Set<() => void>();
  const after = new Set<() => void>();
  const on = (set: Set<() => void>) => (fn: () => void) => {
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  };
  const host = {
    width,
    height,
    canvas: document.createElement("canvas"),
    toLogical: (x: number, y: number) => ({ x, y }),
    hooks: { beforeUpdate: on(before), afterUpdate: on(after) },
  };
  const input = new Input(host, {
    bindings: {
      left: ["ArrowLeft", "TouchStickLeft"],
      right: ["ArrowRight", "TouchStickRight"],
      up: ["ArrowUp", "TouchStickUp"],
      down: ["ArrowDown", "TouchStickDown"],
      jump: ["Space", "TouchA"],
    },
  });
  /** One step: what the scene sees is read inside `during`, between the hooks. */
  const step = <T>(during: () => T): T => {
    for (const fn of before) fn();
    const seen = during();
    for (const fn of after) fn();
    return seen;
  };
  const controls = (options: TouchControlsOptions) => new TouchControls(host, input, options);
  return { host, input, step, controls, pointer: input.pointer };
}

const jump = (input: Input<"left" | "right" | "up" | "down" | "jump">) => ({
  down: input.down("jump"),
  pressed: input.pressed("jump"),
  released: input.released("jump"),
});

describe("TouchControls", () => {
  it("a button feeds its action: pressed, held, released", () => {
    const { input, step, controls, pointer } = game();
    controls({ buttons: { A: { x: -30, y: -30 } } });
    pointer.touchStart(1, 290, 150);
    expect(step(() => jump(input))).toEqual({ down: true, pressed: true, released: false });
    expect(step(() => jump(input))).toEqual({ down: true, pressed: false, released: false });
    pointer.touchEnd(1);
    expect(step(() => jump(input))).toEqual({ down: false, pressed: false, released: true });
    expect(step(() => jump(input))).toEqual({ down: false, pressed: false, released: false });
  });

  it("counts a tap that starts and ends between two steps", () => {
    const { input, step, controls, pointer } = game();
    controls({ buttons: { A: { x: 290, y: 150 } } });
    pointer.touchStart(1, 290, 150);
    pointer.touchEnd(1);
    expect(step(() => jump(input))).toEqual({ down: false, pressed: true, released: true });
  });

  it("stays hidden and ignores the mouse until the first touch", () => {
    const { input, step, controls, pointer } = game();
    const touch = controls({ buttons: { A: { x: 290, y: 150 } } });
    expect(touch.visible).toBe(false);
    pointer.touchStart(1, 290, 150, "mouse");
    expect(step(() => input.down("jump"))).toBe(false);
    pointer.touchEnd(1);
    step(() => undefined);
    pointer.touchStart(2, 290, 150);
    expect(step(() => input.down("jump"))).toBe(true);
    expect(touch.visible).toBe(true);
  });

  it("a fixed stick gives analog x, y and the four directions past the deadzone", () => {
    const { input, step, controls, pointer } = game();
    const touch = controls({ stick: { x: 40, y: 140, radius: 20 } });
    touch.visible = true;
    pointer.touchStart(1, 40, 140);
    step(() => undefined);
    pointer.touchMove(1, 50, 140);
    const half = step(() => ({
      x: touch.stick?.x,
      right: input.down("right"),
      left: input.down("left"),
      axis: input.axis("left", "right"),
    }));
    expect(half).toEqual({ x: 0.5, right: true, left: false, axis: 1 });
    pointer.touchMove(1, 40, 100); // twice the radius up: clamped to 1
    expect(step(() => ({ y: touch.stick?.y, up: input.down("up"), right: input.released("right") }))).toEqual({
      y: -1,
      up: true,
      right: true,
    });
    expect(touch.stick?.knobY).toBe(120);
    pointer.touchMove(1, 44, 140); // inside the deadzone
    expect(step(() => input.down("right"))).toBe(false);
    pointer.touchEnd(1);
    expect(step(() => ({ x: touch.stick?.x, held: touch.stick?.held, up: input.down("up") }))).toEqual({ x: 0, held: false, up: false });
  });

  it("a floating stick centres where the thumb lands in its zone, and goes home on release", () => {
    const { step, controls, pointer } = game();
    const touch = controls({ stick: { x: 40, y: -40, radius: 24, zone: [0, 0, 160, -1] }, show: "always" });
    pointer.touchStart(1, 100, 60);
    step(() => undefined);
    expect([touch.stick?.centerX, touch.stick?.centerY]).toEqual([100, 60]);
    pointer.touchMove(1, 112, 60);
    expect(step(() => touch.stick?.x)).toBe(0.5);
    pointer.touchEnd(1);
    step(() => undefined);
    expect([touch.stick?.centerX, touch.stick?.centerY]).toEqual([40, 140]);
    // Outside the zone (the right half) doesn't grab it.
    pointer.touchStart(2, 250, 60);
    step(() => undefined);
    expect(touch.stick?.held).toBe(false);
  });

  it("each contact keeps its control until it lifts, alongside the other thumb", () => {
    const { input, step, controls, pointer } = game();
    const touch = controls({ stick: { x: 40, y: 140, radius: 20 }, buttons: { A: { x: 290, y: 150 } }, show: "always" });
    pointer.touchStart(1, 40, 140);
    pointer.touchStart(2, 290, 150);
    step(() => undefined);
    pointer.touchMove(1, 60, 140);
    pointer.touchMove(2, 200, 100); // slid off the button: still held
    expect(step(() => ({ right: input.down("right"), jump: input.down("jump"), holding: touch.holding, owns: touch.owns(2) }))).toEqual({
      right: true,
      jump: true,
      holding: true,
      owns: true,
    });
    pointer.touchStart(3, 160, 20); // not on any control
    step(() => undefined);
    expect(touch.owns(3)).toBe(false);
  });

  it("places spots from the right and bottom edges, following the game's size", () => {
    const { host, step, controls } = game();
    const touch = controls({ buttons: { A: { x: -20, y: -10, radius: 8 } } });
    expect([touch.buttons.A?.x, touch.buttons.A?.y, touch.buttons.A?.radius]).toEqual([300, 170, 8]);
    host.width = 400;
    step(() => undefined);
    expect(touch.buttons.A?.x).toBe(380);
  });

  it("draws plain circles only when visible, and puts alpha back", () => {
    const { controls } = game();
    const touch = controls({ stick: { x: 40, y: 140 }, buttons: { A: { x: 290, y: 150 } } });
    const calls: [number, number, number][] = [];
    const draw = { alpha: 0.9, circle: (x: number, y: number, r: number) => void calls.push([x, y, r]) };
    touch.draw(draw);
    expect(calls).toEqual([]);
    touch.visible = true;
    touch.draw(draw);
    expect(calls).toEqual([
      [40, 140, 24],
      [40, 140, 24 * 0.45],
      [290, 150, 16],
    ]);
    expect(draw.alpha).toBe(0.9);
  });

  it("works from real touch events on the canvas, two thumbs at once", () => {
    const { host, input, step, controls } = game();
    const touch = controls({ stick: { x: 40, y: 140, radius: 20 }, buttons: { A: { x: 290, y: 150 } } });
    const event = (type: string, id: number, x: number, y: number, isPrimary: boolean) =>
      new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, isPrimary, buttons: 1, cancelable: true });
    host.canvas.dispatchEvent(event("pointerdown", 11, 40, 140, true));
    host.canvas.dispatchEvent(event("pointerdown", 12, 290, 150, false));
    expect(step(() => ({ jump: input.pressed("jump"), visible: touch.visible }))).toEqual({ jump: true, visible: true });
    host.canvas.dispatchEvent(event("pointermove", 11, 60, 140, true));
    expect(step(() => ({ right: input.down("right"), jump: input.down("jump") }))).toEqual({ right: true, jump: true });
    host.canvas.dispatchEvent(event("pointerup", 12, 290, 150, false));
    host.canvas.dispatchEvent(event("pointerup", 11, 60, 140, true));
    expect(step(() => ({ right: input.released("right"), jump: input.released("jump"), holding: touch.holding }))).toEqual({
      right: true,
      jump: true,
      holding: false,
    });
  });

  it("dispose() removes its sources, which then read as up", () => {
    const { input, step, controls, pointer } = game();
    const touch = controls({ buttons: { A: { x: 290, y: 150 } }, show: "always" });
    touch.dispose();
    expect(input.virtual.size).toBe(0);
    pointer.touchStart(1, 290, 150);
    expect(step(() => input.down("jump"))).toBe(false);
  });
});
