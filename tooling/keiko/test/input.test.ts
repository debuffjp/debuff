// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Pointer } from "../../../packages/input/src/pointer.js";
import type { VirtualClock } from "../src/clock.js";
import { type DebuffDevHooks, debuffDriver, genericDriver, MissingHookError, TOUCH_POINTER_OFFSET } from "../src/driver.js";
import { Playtest } from "../src/playtest.js";

/** keiko's DOM driver against a page with a canvas, read back through @debuffjp/input's real Pointer. */
function page() {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const pointer = new Pointer(canvas, (x, y) => ({ x, y }));
  const driver = genericDriver(window, {} as VirtualClock);
  const seen: string[] = [];
  for (const type of ["pointerdown", "pointermove", "pointerup", "contextmenu", "wheel", "touchstart", "touchend"])
    canvas.addEventListener(type, (e) => seen.push(`${type}${e instanceof PointerEvent ? `:${e.pointerType}` : ""}`));
  return { canvas, pointer, driver, seen };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DOM input: right button, wheel and touch", () => {
  it("presses the right and middle buttons like keys, by their binding names", () => {
    const { pointer, driver, seen } = page();
    driver.pointerMove(30, 40);
    driver.press("PointerRight");
    expect([pointer.right.down, pointer.right.pressed, pointer.down]).toEqual([true, true, false]);
    expect(seen).toContain("contextmenu");
    // Middle while right is held arrives as a move, as in browsers.
    seen.length = 0;
    driver.press("PointerMiddle");
    expect([seen[0], pointer.middle.down]).toEqual(["pointermove:mouse", true]);
    driver.release("PointerRight");
    driver.release("PointerMiddle");
    expect([pointer.right.down, pointer.middle.down, pointer.right.released]).toEqual([false, false, true]);
    expect(seen.at(-1)).toBe("pointerup:mouse");
  });

  it("scrolls the wheel over the game", () => {
    const { pointer, driver } = page();
    driver.wheel(-120, 0);
    driver.wheel(20, 5);
    expect([pointer.wheel, pointer.wheelX]).toEqual([-100, 5]);
  });

  it("puts fingers down as touch pointer events plus touch events, the first one primary", () => {
    const { pointer, driver, seen } = page();
    driver.touchDown(4, 10, 10);
    driver.touchDown(5, 50, 50);
    expect([pointer.touches.size, pointer.down, pointer.kind]).toEqual([2, true, "touch"]);
    expect(seen.filter((s) => s.startsWith("touchstart"))).toHaveLength(2);
    driver.touchMove(5, 60, 60);
    driver.touchMove(4, 12, 14);
    expect([pointer.x, pointer.y, pointer.touches.get(5 + TOUCH_POINTER_OFFSET)?.x]).toEqual([12, 14, 60]);
    driver.touchUp(4);
    expect([pointer.down, pointer.touches.size]).toEqual([false, 1]);
    driver.touchUp(5);
    driver.touchUp(5); // already up: nothing sent
    expect(seen.filter((s) => s === "touchend")).toHaveLength(2);
    expect(pointer.touchesEnded.map((t) => t.id)).toEqual([6, 7]);
  });

  it("keeps finger 1 apart from the mouse, which is pointerId 1", () => {
    const { pointer, driver } = page();
    driver.pointerDown(0, 0);
    driver.touchDown(1, 3, 3);
    expect([...pointer.touches.keys()]).toEqual([1, 1 + TOUCH_POINTER_OFFSET]);
    driver.touchUp(1);
    expect([...pointer.touches.keys()]).toEqual([1]);
  });

  it("sends a pen as pointer events only", () => {
    const { pointer, driver, seen } = page();
    driver.touchDown(9, 1, 2, "pen");
    expect([pointer.kind, seen]).toEqual(["pen", ["pointerdown:pen"]]);
  });
});

describe("debuff driver: wheel and touch", () => {
  it("goes through the dev hooks, and asks for a newer @debuffjp/dev when they're missing", () => {
    const calls: unknown[][] = [];
    const base = { state: () => ({ tick: 0, time: 0, step: 1 / 60, scene: "play", state: {} }) } as unknown as DebuffDevHooks;
    const hooks = {
      ...base,
      wheel: (...a: unknown[]) => calls.push(["wheel", ...a]),
      touchDown: (...a: unknown[]) => calls.push(["touchDown", ...a]),
      touchMove: (...a: unknown[]) => calls.push(["touchMove", ...a]),
      touchUp: (...a: unknown[]) => calls.push(["touchUp", ...a]),
    } as unknown as DebuffDevHooks;
    const driver = debuffDriver(hooks);
    driver.wheel(-5, 1);
    driver.touchDown(1, 2, 3);
    driver.touchMove(1, 4, 5);
    driver.touchUp(1);
    expect(calls).toEqual([
      ["wheel", -5, 1],
      ["touchDown", 1, 2, 3, undefined],
      ["touchMove", 1, 4, 5],
      ["touchUp", 1],
    ]);
    expect(() => debuffDriver(base).wheel(1, 0)).toThrow(MissingHookError);
    expect(() => debuffDriver(base).touchDown(1, 0, 0)).toThrow(/no touchDown\(\) hook. Update it to 0.16/);
  });
});

describe("Playtest: wheel and touch", () => {
  it("plays them directly and from scenario steps", () => {
    const { pointer, driver } = page();
    const seen: string[] = [];
    const watched = {
      ...driver,
      step: () => {
        seen.push(`${pointer.wheel} ${pointer.touches.size} ${pointer.right.down}`);
        pointer.endStep();
      },
      tick: () => seen.length,
      state: () => ({}),
    };
    const game = new Playtest(watched as typeof driver, { root: process.cwd() });
    game.wheel(-40).touchDown(1, 5, 5).wait(1);
    game.replay({
      steps: [
        { wheel: [10, 2] },
        { touchDown: [2, 9, 9, "pen"] },
        { touchMove: [2, 10, 10] },
        { press: "PointerRight" },
        { wait: 1 },
        { touchUp: 2 },
        { release: "PointerRight" },
      ],
    });
    game.touchMove(1, 6, 6).touchUp(1).wait(1);
    expect(seen).toEqual(["-40 1 false", "10 2 true", "0 0 false"]);
  });
});

describe("pointerDown with a kind", () => {
  it("presses as a touch or pen contact without a mouse press as well", () => {
    const { pointer, driver, seen } = page();
    driver.pointerDown(10, 10, "touch");
    driver.pointerMove(20, 20);
    expect([pointer.kind, pointer.x, pointer.touches.get(1 + TOUCH_POINTER_OFFSET)?.kind]).toEqual(["touch", 20, "touch"]);
    expect(seen.some((s) => s.endsWith(":mouse"))).toBe(false);
    driver.pointerUp();
    expect([pointer.down, pointer.touches.size]).toEqual([false, 0]);
    driver.pointerDown(1, 1);
    expect(pointer.kind).toBe("mouse");
  });

  it("passes the kind to debuff's dev hooks, and leaves a mouse press as it was", () => {
    const calls: unknown[][] = [];
    const hooks = {
      state: () => ({ tick: 0, time: 0, step: 1 / 60, scene: "play", state: {} }),
      pointerDown: (...a: unknown[]) => calls.push(a),
    } as unknown as DebuffDevHooks;
    const driver = debuffDriver(hooks);
    driver.pointerDown(1, 2);
    driver.pointerDown(3, 4, "pen");
    expect(calls).toEqual([
      [1, 2],
      [3, 4, "pen"],
    ]);
  });
});
