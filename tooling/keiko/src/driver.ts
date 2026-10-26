import type { VirtualClock } from "./clock.js";

/** What presses the pointer: a mouse, a finger or a pen. */
export type PointerKind = "mouse" | "touch" | "pen";

/** Thrown when a test uses something the game doesn't expose through `window.__KEIKO__`. */
export class MissingHookError extends Error {
  override readonly name = "MissingHookError";
}

/** A tunable value: what a game's params hold. */
export type ParamValue = number | boolean | string;

/**
 * What a game can expose as `window.__KEIKO__` to be tested with keiko. **Everything is optional.**
 * Without it, keiko still steps the game through its virtual clock and sends real keyboard and
 * pointer events; the hooks just let tests read state, and engines with their own fixed step
 * advance exactly.
 *
 * ```ts
 * // In your game, in development builds only:
 * if (import.meta.env.DEV) {
 *   window.__KEIKO__ = {
 *     state: () => ({ player: { x: player.x, y: player.y }, score }),
 *     scene: () => game.scene.getScenes(true)[0]?.scene.key,
 *   };
 * }
 * ```
 */
export interface KeikoHooks {
  /** A JSON-friendly snapshot of the game, read by `game.state`. */
  state?(): unknown;
  /** The active scene or screen's name, read by `game.scene`. */
  scene?(): string | undefined;
  /**
   * Advance exactly `steps` simulation steps. Leave it out to let keiko advance time one frame per step
   * and run your `requestAnimationFrame` loop.
   */
  step?(steps: number): void;
  /** Seconds per step, when you implement `step`. Default 1/60. */
  stepSeconds?: number;
  /** Key input, if your game prefers it over DOM keyboard events. Codes are `KeyboardEvent.code`. */
  press?(code: string): void;
  release?(code: string): void;
  /** Pointer input in your game's own coordinates, if you prefer it over DOM pointer events. */
  pointerDown?(x: number, y: number): void;
  pointerMove?(x: number, y: number): void;
  pointerUp?(): void;
  /** Tunable values by group, for `game.param()` and `game.set()`: `{ player: { speed: 140 } }`. */
  params?(): Record<string, Record<string, ParamValue>>;
  setParam?(group: string, key: string, value: ParamValue): void;
  /** Named shortcuts for tests, like warping to a level: `game.command("warp", 3)`. */
  command?(name: string, ...args: unknown[]): unknown;
}

/**
 * How keiko drives a booted game, whatever engine it uses. Built from debuff's dev hooks, a game's
 * `window.__KEIKO__`, or neither (virtual clock plus DOM events).
 */
export interface Driver {
  /** `"debuff"`, `"keiko"` (the game exposes `__KEIKO__`) or `"clock"` (no hooks). */
  readonly kind: "debuff" | "keiko" | "clock";
  readonly stepSeconds: number;
  tick(): number;
  time(): number;
  scene(): string | undefined;
  state(): unknown;
  /** Everything a test can read with `game.get(path)`. */
  snapshot(): Record<string, unknown>;
  step(steps: number): void;
  press(code: string): void;
  release(code: string): void;
  tap(x: number, y: number): void;
  /** Press the primary pointer as a mouse, or as a `"touch"` or `"pen"` contact. */
  pointerDown(x: number, y: number, kind?: PointerKind): void;
  pointerMove(x: number, y: number): void;
  pointerUp(): void;
  /** Scroll the wheel by `dy` (and `dx`) CSS pixels over the game. */
  wheel(dy: number, dx: number): void;
  /** Touch contacts by id, in the game's coordinates. A `"pen"` contact is a stylus. */
  touchDown(id: number, x: number, y: number, kind?: "pen"): void;
  touchMove(id: number, x: number, y: number): void;
  touchUp(id: number): void;
  params(): Record<string, Record<string, ParamValue>>;
  setParam(group: string, key: string, value: ParamValue): void;
  command(name: string, ...args: unknown[]): unknown;
}

/** The parts of debuff's `window.__DEBUFF_DEV__` keiko uses (debuff ≥ 0.2). */
export interface DebuffDevHooks {
  readonly controlled: boolean;
  step(steps?: number): unknown;
  state(): { tick: number; time: number; step?: number; scene: string | undefined; state: unknown } & Record<string, unknown>;
  press(code: string): void;
  release(code: string): void;
  tap(x: number, y: number): void;
  /** `kind` needs @debuffjp/dev 0.16+; older versions press as a mouse. */
  pointerDown(x: number, y: number, kind?: PointerKind): void;
  pointerMove(x: number, y: number): void;
  pointerUp(): void;
  /** @debuffjp/dev 0.16+. */
  wheel?(dy: number, dx?: number): void;
  touchDown?(id: number, x: number, y: number, kind?: "touch" | "pen"): void;
  touchMove?(id: number, x: number, y: number): void;
  touchUp?(id: number): void;
  params(): Record<string, { values: Record<string, ParamValue> }>;
  setParam(group: string, key: string, value: never): void;
  command(name: string, ...args: unknown[]): unknown;
}

/**
 * debuff games: its dev hooks already step, read and drive the game exactly, with explained errors.
 * With a clock, game timers (`setTimeout`, `setInterval`) advance step by step alongside the simulation.
 */
export function debuffDriver(hooks: DebuffDevHooks, clock?: VirtualClock): Driver {
  const stepSeconds = hooks.state().step ?? 1 / 60;
  const stepMs = stepSeconds * 1000;
  return {
    kind: "debuff",
    stepSeconds,
    tick: () => hooks.state().tick,
    time: () => hooks.state().time,
    scene: () => hooks.state().scene,
    state: () => hooks.state().state,
    snapshot: () => hooks.state(),
    step(n) {
      if (!clock) {
        hooks.step(n);
        return;
      }
      // Step in bulk up to the next timer, so it fires between the simulation steps it falls between.
      let left = n;
      while (left > 0) {
        const bulk = Math.max(1, Math.min(left, Math.floor(clock.untilNextTimer / stepMs + 1e-9)));
        hooks.step(bulk);
        clock.advanceTime(bulk * stepMs);
        left -= bulk;
      }
    },
    press: (c) => hooks.press(c),
    release: (c) => hooks.release(c),
    tap: (x, y) => hooks.tap(x, y),
    pointerDown: (x, y, kind) => (kind && kind !== "mouse" ? hooks.pointerDown(x, y, kind) : hooks.pointerDown(x, y)),
    pointerMove: (x, y) => hooks.pointerMove(x, y),
    pointerUp: () => hooks.pointerUp(),
    wheel: (dy, dx) => newer(hooks.wheel, "wheel").call(hooks, dy, dx),
    touchDown: (id, x, y, kind) => newer(hooks.touchDown, "touchDown").call(hooks, id, x, y, kind),
    touchMove: (id, x, y) => newer(hooks.touchMove, "touchMove").call(hooks, id, x, y),
    touchUp: (id) => newer(hooks.touchUp, "touchUp").call(hooks, id),
    params: () => Object.fromEntries(Object.entries(hooks.params()).map(([g, d]) => [g, { ...d.values }])),
    setParam: (g, k, v) => hooks.setParam(g, k, v as never),
    command: (name, ...args) => hooks.command(name, ...args),
  };
}

/** A dev hook newer debuff versions have, or an error saying to update. */
function newer<F>(fn: F | undefined, name: string): F {
  if (!fn)
    throw new MissingHookError(
      `This game's @debuffjp/dev has no ${name}() hook. Update it to 0.16 or later (npm i -D @debuffjp/dev@latest).`,
    );
  return fn;
}

/** The right and middle mouse buttons, which tests press like keys by their binding names. */
const MOUSE_BUTTONS: Readonly<Record<string, 1 | 2>> = { PointerRight: 2, PointerMiddle: 1 };

/**
 * Any other game: `window.__KEIKO__` (looked up on every call, so hooks installed late still count)
 * with keiko's virtual clock and DOM events filling in whatever the game doesn't provide.
 */
export function genericDriver(window: Window & { __KEIKO__?: KeikoHooks }, clock: VirtualClock): Driver {
  const hooks = (): KeikoHooks => window.__KEIKO__ ?? {};
  const dom = domInput(window);
  let ownTicks = 0;
  /** A touch or pen `pointerDown` is held as contact 1. */
  let contact = false;
  const missing = (what: string, hook: string) =>
    new MissingHookError(`This game doesn't expose ${what}. Add \`${hook}\` to window.__KEIKO__ (in development builds).`);
  const stepSeconds = () => hooks().stepSeconds ?? clock.stepMs / 1000;
  return {
    get kind() {
      return window.__KEIKO__ ? ("keiko" as const) : ("clock" as const);
    },
    get stepSeconds() {
      return stepSeconds();
    },
    tick: () => (hooks().step ? ownTicks : clock.tick),
    time: () => (hooks().step ? ownTicks * stepSeconds() : clock.ms / 1000),
    scene: () => hooks().scene?.(),
    state: () => hooks().state?.(),
    snapshot() {
      return { tick: this.tick(), time: this.time(), scene: this.scene(), state: this.state(), params: hooks().params?.() };
    },
    step(n) {
      const own = hooks().step;
      if (own) {
        own.call(hooks(), n);
        ownTicks += n;
        // Timers in the game still see time move, even when it steps itself.
        clock.advanceTime(n * stepSeconds() * 1000);
      } else {
        clock.advance(n);
      }
    },
    press: (c) => (MOUSE_BUTTONS[c] ? dom.button("down", MOUSE_BUTTONS[c]) : hooks().press ? hooks().press?.(c) : dom.key("keydown", c)),
    release: (c) => (MOUSE_BUTTONS[c] ? dom.button("up", MOUSE_BUTTONS[c]) : hooks().release ? hooks().release?.(c) : dom.key("keyup", c)),
    tap(x, y) {
      this.pointerDown(x, y);
      this.step(1);
      this.pointerUp();
    },
    pointerDown(x, y, kind = "mouse") {
      if (kind !== "mouse") {
        dom.touch("down", 1, x, y, kind);
        contact = true;
      } else if (hooks().pointerDown) hooks().pointerDown?.(x, y);
      else dom.pointer("down", x, y);
    },
    pointerMove: (x, y) =>
      contact ? dom.touch("move", 1, x, y) : hooks().pointerMove ? hooks().pointerMove?.(x, y) : dom.pointer("move", x, y),
    pointerUp() {
      if (contact) {
        contact = false;
        dom.touch("up", 1);
      } else if (hooks().pointerUp) hooks().pointerUp?.();
      else dom.pointer("up");
    },
    wheel: (dy, dx) => dom.wheel(dy, dx),
    touchDown: (id, x, y, kind) => dom.touch("down", id, x, y, kind),
    touchMove: (id, x, y) => dom.touch("move", id, x, y),
    touchUp: (id) => dom.touch("up", id),
    params: () => {
      const p = hooks().params;
      if (!p) throw missing("params", "params()");
      return p.call(hooks());
    },
    setParam: (g, k, v) => {
      const set = hooks().setParam;
      if (!set) throw missing("settable params", "setParam(group, key, value)");
      set.call(hooks(), g, k, v);
    },
    command: (name, ...args) => {
      const run = hooks().command;
      if (!run) throw missing(`a "${name}" command`, "command(name, ...args)");
      return run.call(hooks(), name, ...args);
    },
  };
}

/**
 * Real DOM events, for games that read input from the browser: keys go to the focused element (or the
 * game's canvas) and bubble to `document` and `window`; pointer events go to the game's canvas.
 */
function domInput(window: Window) {
  const held = new Set<string>();
  let last = { x: 0, y: 0 };
  let moved = false;
  let pressed = false;
  /** Right (2) and middle (4) bits of `PointerEvent.buttons`. */
  let aux = 0;
  const touches = new Map<number, { x: number; y: number; type: "touch" | "pen" }>();
  let primaryTouch: number | undefined;
  // Keys go where a player's would: the focused element, or the game's canvas (players click the game first).
  // They bubble up to document and window, so listeners anywhere hear them.
  const target = () => {
    const doc = window.document;
    const active = doc.activeElement;
    return (active && active !== doc.body ? active : (doc.querySelector("canvas") ?? doc.body)) as unknown as EventTarget;
  };
  const canvas = () => (window.document.querySelector("canvas") ?? window.document.body) as unknown as EventTarget;
  const W = window as unknown as {
    KeyboardEvent: typeof KeyboardEvent;
    PointerEvent?: typeof PointerEvent;
    MouseEvent: typeof MouseEvent;
    WheelEvent?: typeof WheelEvent;
    TouchEvent?: typeof TouchEvent;
    Touch?: typeof Touch;
  };
  // The page doesn't scroll and the canvas sits at the origin, so every position field is the same point.
  // DOM implementations often leave pageX/offsetX at 0, and engines read different ones (Phaser: pageX).
  const positioned = <E extends Event>(event: E, x: number, y: number): E => {
    for (const field of ["pageX", "offsetX", "screenX", "layerX", "x"]) Object.defineProperty(event, field, { value: x });
    for (const field of ["pageY", "offsetY", "screenY", "layerY", "y"]) Object.defineProperty(event, field, { value: y });
    return event;
  };
  const common = { bubbles: true, cancelable: true, composed: true };
  return {
    key(type: "keydown" | "keyup", code: string) {
      if (type === "keydown" && held.has(code)) return;
      if (type === "keydown") held.add(code);
      else if (!held.delete(code)) return;
      const keyCode = keyCodeFor(code);
      const init = { code, key: keyFor(code), keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true };
      const event = new W.KeyboardEvent(type, init);
      // Some DOM implementations ignore the legacy fields in the init dict; engines like Phaser still read them.
      for (const field of ["keyCode", "which"] as const) {
        if ((event as unknown as Record<string, unknown>)[field] !== keyCode) Object.defineProperty(event, field, { value: keyCode });
      }
      target().dispatchEvent(event);
    },
    pointer(kind: "down" | "move" | "up", x = last.x, y = last.y) {
      // A real pointer moves to where it presses, and engines like KAPLAY only track position on moves.
      if (kind === "down" && (!moved || x !== last.x || y !== last.y)) this.pointer("move", x, y);
      moved = true;
      last = { x, y };
      if (kind !== "move") pressed = kind === "down";
      const init = { clientX: x, clientY: y, button: 0, buttons: (pressed ? 1 : 0) | aux, ...common };
      const el = canvas();
      const PointerCtor = W.PointerEvent ?? W.MouseEvent;
      el.dispatchEvent(
        positioned(new PointerCtor(`pointer${kind}`, { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true }), x, y),
      );
      el.dispatchEvent(positioned(new W.MouseEvent(`mouse${kind}`, init), x, y));
      if (kind === "up") el.dispatchEvent(positioned(new W.MouseEvent("click", init), x, y));
    },
    /** The right (`2`) or middle (`1`) mouse button, at the mouse's last position. */
    button(kind: "down" | "up", button: 1 | 2) {
      const bit = button === 2 ? 2 : 4;
      if (kind === "down" ? aux & bit : !(aux & bit)) return;
      const before = (pressed ? 1 : 0) | aux;
      aux = kind === "down" ? aux | bit : aux & ~bit;
      const buttons = (pressed ? 1 : 0) | aux;
      // As in browsers, a button pressed or let go while another is held is a pointermove, not down or up.
      const type = kind === "down" ? (before ? "pointermove" : "pointerdown") : buttons ? "pointermove" : "pointerup";
      const { x, y } = last;
      const init = { clientX: x, clientY: y, button, buttons, ...common };
      const el = canvas();
      const PointerCtor = W.PointerEvent ?? W.MouseEvent;
      el.dispatchEvent(positioned(new PointerCtor(type, { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true }), x, y));
      el.dispatchEvent(positioned(new W.MouseEvent(`mouse${kind}`, init), x, y));
      if (kind === "down" && button === 2) el.dispatchEvent(positioned(new W.MouseEvent("contextmenu", init), x, y));
      if (kind === "up") el.dispatchEvent(positioned(new W.MouseEvent("auxclick", init), x, y));
    },
    /** Wheel scroll in pixels at the mouse's last position. */
    wheel(dy: number, dx: number) {
      const { x, y } = last;
      const init = { clientX: x, clientY: y, deltaX: dx, deltaY: dy, deltaZ: 0, deltaMode: 0, ...common };
      const event = W.WheelEvent
        ? new W.WheelEvent("wheel", init)
        : Object.assign(new W.MouseEvent("wheel", init), { deltaX: dx, deltaY: dy, deltaMode: 0 });
      canvas().dispatchEvent(positioned(event, x, y));
    },
    /** A finger, as browsers report it: pointer events with `pointerType: "touch"`, then touch events. */
    touch(kind: "down" | "move" | "up", id: number, x?: number, y?: number, pointerType: "touch" | "pen" = "touch") {
      const known = touches.get(id);
      const type = kind === "down" ? pointerType : (known?.type ?? "touch");
      if (kind === "down" ? known : !known) return;
      const at = { x: x ?? known?.x ?? 0, y: y ?? known?.y ?? 0 };
      if (kind === "up") touches.delete(id);
      else touches.set(id, { ...at, type });
      if (kind === "down" && primaryTouch === undefined) primaryTouch = id;
      const isPrimary = id === primaryTouch;
      if (kind === "up" && isPrimary) primaryTouch = undefined;
      const el = canvas();
      const init = { clientX: at.x, clientY: at.y, button: kind === "move" ? -1 : 0, buttons: kind === "up" ? 0 : 1, ...common };
      const PointerCtor = W.PointerEvent ?? W.MouseEvent;
      el.dispatchEvent(positioned(new PointerCtor(`pointer${kind}`, { ...init, pointerId: id, pointerType: type, isPrimary }), at.x, at.y));
      // Pens send pointer events only; fingers send touch events as well.
      if (type === "pen" || !W.TouchEvent || !W.Touch) return;
      const point = (i: number, p: { x: number; y: number }) =>
        new (W.Touch as typeof Touch)({
          identifier: i,
          target: el,
          clientX: p.x,
          clientY: p.y,
          pageX: p.x,
          pageY: p.y,
          screenX: p.x,
          screenY: p.y,
        });
      const changed = point(id, at);
      const active = [...touches].filter(([, p]) => p.type === "touch").map(([i, p]) => point(i, p));
      const touchType = kind === "down" ? "touchstart" : kind === "move" ? "touchmove" : "touchend";
      el.dispatchEvent(new W.TouchEvent(touchType, { touches: active, targetTouches: active, changedTouches: [changed], ...common }));
    },
  };
}

/** The legacy `KeyboardEvent.keyCode` for a `code`, which older engines (Phaser's key objects) still read. 0 if unknown. */
export function keyCodeFor(code: string): number {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit\d$/.test(code)) return 48 + Number(code.slice(5));
  if (/^Numpad\d$/.test(code)) return 96 + Number(code.slice(6));
  if (/^F([1-9]|1[0-2])$/.test(code)) return 111 + Number(code.slice(1));
  const named: Record<string, number> = {
    Backspace: 8,
    Tab: 9,
    Enter: 13,
    NumpadEnter: 13,
    ShiftLeft: 16,
    ShiftRight: 16,
    ControlLeft: 17,
    ControlRight: 17,
    AltLeft: 18,
    AltRight: 18,
    Pause: 19,
    CapsLock: 20,
    Escape: 27,
    Space: 32,
    PageUp: 33,
    PageDown: 34,
    End: 35,
    Home: 36,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Insert: 45,
    Delete: 46,
    MetaLeft: 91,
    MetaRight: 92,
    Semicolon: 186,
    Equal: 187,
    Comma: 188,
    Minus: 189,
    Period: 190,
    Slash: 191,
    Backquote: 192,
    BracketLeft: 219,
    Backslash: 220,
    BracketRight: 221,
    Quote: 222,
  };
  return named[code] ?? 0;
}

/** The `KeyboardEvent.key` a US layout produces for a `code`, which engines that read `key` expect. */
export function keyFor(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code.slice(6);
  const named: Record<string, string> = {
    Space: " ",
    ShiftLeft: "Shift",
    ShiftRight: "Shift",
    ControlLeft: "Control",
    ControlRight: "Control",
    AltLeft: "Alt",
    AltRight: "Alt",
    MetaLeft: "Meta",
    MetaRight: "Meta",
    NumpadEnter: "Enter",
    Minus: "-",
    Equal: "=",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Backquote: "`",
  };
  return named[code] ?? code;
}
