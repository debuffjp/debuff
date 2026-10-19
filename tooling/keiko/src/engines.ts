/*
 * What keiko can read from an engine without any hook in the game: the active scene, and the things a
 * player can press, in page pixels for `tap(x, y)`. Found where engines announce themselves: PixiJS 8's
 * `__PIXI_APP_INIT__` devtools hook, and Phaser 3's global `Phaser` (or any script-tag build).
 */

type Obj = Record<string | symbol, unknown>;

/** Something on screen a player can press. `x`, `y` are its centre in page pixels, ready for `tap(x, y)`. */
export interface EngineTarget {
  /** The object's class (`"FancyButton"`, `"Text"`), or Phaser's game object type (`"Image"`). */
  type: string;
  /** Its own text, or the first text inside it, if any. */
  text?: string;
  /** Its name or label, if the game gave it one. */
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What keiko read from the engine. Always fresh. */
export interface EngineInfo {
  name: "phaser" | "pixi";
  /** Phaser: the key of the topmost active scene. PixiJS: the class of the topmost visible screen on the stage. */
  scene: string | undefined;
  /** Phaser: every active scene's key, bottom to top. PixiJS: the classes of the visible screens, looking through plain containers, bottom to top. */
  scenes: string[];
  /** Visible, interactive objects, top-level first. */
  targets: EngineTarget[];
}

export interface EngineWatch {
  info(): EngineInfo | undefined;
  dispose(): void;
}

const MAX_TARGETS = 200;
const round = (n: number) => Math.round(n);
const className = (o: Obj) => (o.constructor as { name?: string } | undefined)?.name || "Object";

/** Start watching for engines. Call before the game's scripts run; dispose when the page closes. */
export function watchEngines(window: Window): EngineWatch {
  const g = globalThis as unknown as Obj;
  let pixiApp: Obj | undefined;
  let phaserGame: Obj | undefined;

  const previousPixi = g.__PIXI_APP_INIT__ as ((...a: unknown[]) => unknown) | undefined;
  const pixiHook = (app: unknown, version: unknown) => {
    previousPixi?.(app, version);
    pixiApp ??= app as Obj;
  };
  g.__PIXI_APP_INIT__ = pixiHook;

  // Phaser: catch the game the first time its scene manager updates (the game is often a module-scoped const).
  let patchedPhaser: Obj | undefined;
  const findPhaser = () => {
    if (phaserGame) return phaserGame;
    const Phaser = (g.Phaser ?? (window as unknown as Obj).Phaser) as Obj | undefined;
    const proto = ((Phaser?.Scenes as Obj | undefined)?.SceneManager as Obj | undefined)?.prototype as Obj | undefined;
    if (!proto || patchedPhaser === proto) return undefined;
    patchedPhaser = proto;
    const update = proto.update as (...a: unknown[]) => unknown;
    proto.update = function (this: Obj, ...args: unknown[]) {
      phaserGame ??= this.game as Obj;
      return update.apply(this, args);
    };
    return undefined;
  };

  return {
    info() {
      const game = findPhaser();
      if (game) return phaserInfo(game);
      if (pixiApp?.stage) return pixiInfo(pixiApp);
      return undefined;
    },
    dispose() {
      if (g.__PIXI_APP_INIT__ === pixiHook) {
        if (previousPixi) g.__PIXI_APP_INIT__ = previousPixi;
        else delete g.__PIXI_APP_INIT__;
      }
    },
  };
}

function phaserInfo(game: Obj): EngineInfo {
  const manager = game.scene as { getScenes(active: boolean): Obj[] };
  const active = manager.getScenes(true) ?? [];
  const key = (s: Obj) => ((s.sys as Obj)?.settings as Obj)?.key as string;
  // Game pixels to page pixels: the scale manager knows how the canvas was fitted.
  const scale = game.scale as
    | { displayScale?: { x: number; y: number }; canvasBounds?: { x: number; y: number; width: number; height: number } }
    | undefined;
  const sx = scale?.displayScale?.x || 1;
  const sy = scale?.displayScale?.y || 1;
  const ox = scale?.canvasBounds?.x ?? 0;
  const oy = scale?.canvasBounds?.y ?? 0;
  const targets: EngineTarget[] = [];
  for (const scene of [...active].reverse()) {
    const list = ((scene.sys as Obj)?.displayList as { list?: Obj[] } | undefined)?.list ?? [];
    for (const o of [...list].reverse()) {
      if (targets.length >= MAX_TARGETS) break;
      if (!o.input || !(o.input as Obj).enabled || o.visible === false || o.alpha === 0) continue;
      const b = (o.getBounds as (() => { x: number; y: number; width: number; height: number }) | undefined)?.call(o);
      if (!b) continue;
      const text = typeof o.text === "string" ? o.text : undefined;
      targets.push({
        type: (o.type as string) || className(o),
        ...(text ? { text } : {}),
        ...(o.name ? { name: o.name as string } : {}),
        x: round(ox + (b.x + b.width / 2) / sx),
        y: round(oy + (b.y + b.height / 2) / sy),
        width: round(b.width / sx),
        height: round(b.height / sy),
      });
    }
  }
  const scenes = active.map(key);
  const view = scale?.canvasBounds?.width ? scale.canvasBounds : undefined;
  return { name: "phaser", scene: scenes[scenes.length - 1], scenes, targets: onScreen(targets, view) };
}

function pixiInfo(app: Obj): EngineInfo {
  const stage = app.stage as Obj;
  const renderer = app.renderer as { width: number; height: number; canvas?: { clientWidth?: number } } | undefined;
  // Stage pixels to page pixels (games often render at a higher resolution than the canvas's CSS size).
  const toPage = renderer?.canvas?.clientWidth && renderer.width ? renderer.canvas.clientWidth / renderer.width : 1;
  const children = ((stage.children as Obj[] | undefined) ?? []).filter((c) => c.visible !== false);
  // Screens are often inside plain containers (a screen manager's layer): look through those.
  const screens: string[] = [];
  const plain = (n: string) => n === "Container" || n === "Object" || n.startsWith("_");
  const findScreens = (list: Obj[], depth: number) => {
    for (const c of list) {
      if (c.visible === false) continue;
      const n = className(c);
      if (!plain(n)) screens.push(n);
      else if (depth < 3) findScreens((c.children as Obj[] | undefined) ?? [], depth + 1);
    }
  };
  findScreens(children, 0);
  const targets: EngineTarget[] = [];
  const shown = (o: Obj) => o.visible !== false && o.alpha !== 0 && o.renderable !== false;
  const walk = (o: Obj) => {
    if (targets.length >= MAX_TARGETS || !shown(o)) return;
    // Objects inside a container that isn't taking input (a screen mid-transition) can't be pressed.
    if (o.interactiveChildren !== false) for (const c of [...((o.children as Obj[] | undefined) ?? [])].reverse()) walk(c);
    const mode = o.eventMode as string | undefined;
    if (mode === "static" || mode === "dynamic") {
      const b = (o.getBounds as (() => { x: number; y: number; width: number; height: number }) | undefined)?.call(o);
      if (!b || !(b.width > 0 && b.height > 0)) return;
      const text = textIn(o);
      const name = (o.label as string | undefined) || undefined;
      targets.push({
        type: className(o),
        ...(text ? { text } : {}),
        ...(name && name !== className(o) ? { name } : {}),
        x: round((b.x + b.width / 2) * toPage),
        y: round((b.y + b.height / 2) * toPage),
        width: round(b.width * toPage),
        height: round(b.height * toPage),
      });
    }
  };
  for (const c of [...children].reverse()) walk(c);
  const view = renderer?.width ? { x: 0, y: 0, width: renderer.width * toPage, height: renderer.height * toPage } : undefined;
  return { name: "pixi", scene: screens[screens.length - 1], scenes: screens, targets: onScreen(targets, view) };
}

/**
 * Only targets whose centre is on the canvas: screens often park buttons off to one side before they
 * slide in, and a tap there would miss.
 */
function onScreen(targets: EngineTarget[], view: { x: number; y: number; width: number; height: number } | undefined) {
  if (!view) return targets;
  return targets.filter((t) => t.x >= view.x && t.y >= view.y && t.x <= view.x + view.width && t.y <= view.y + view.height);
}

/** The object's own text, or the first text among its descendants (a button's label). */
function textIn(o: Obj, depth = 0): string | undefined {
  if (typeof o.text === "string" && o.text) return o.text;
  if (depth > 4) return undefined;
  for (const c of (o.children as Obj[] | undefined) ?? []) {
    const t = textIn(c, depth + 1);
    if (t) return t;
  }
  return undefined;
}
