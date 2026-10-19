import type { Profiler } from "./profiler.js";

/*
 * Engine adapters: spans for the engine's own update and render, so a slow frame inside an engine's loop
 * says whether game logic or drawing took the time, and which scene. Found automatically where engines
 * announce themselves (PixiJS and three.js devtools hooks, a global `Phaser`); `adapt(profiler, game)`
 * covers the rest (Phaser 4's ES module build has no global).
 */

type Fn = (...args: unknown[]) => unknown;
type Obj = Record<string | symbol, unknown>;

const PATCHED = Symbol.for("myaku.patched");

/** Replace `obj[name]` with a version timed as span `span` (a name, or derived from `this`). Once per object. */
function timeMethod(profiler: Profiler, obj: Obj, name: string, span: string | ((self: Obj) => string)): boolean {
  const fn = obj[name];
  if (typeof fn !== "function" || (fn as unknown as Obj)[PATCHED]) return false;
  const timed = function (this: Obj, ...args: unknown[]) {
    const start = performance.now();
    try {
      return (fn as Fn).apply(this, args);
    } finally {
      profiler.addSpan(typeof span === "string" ? span : span(this), performance.now() - start);
    }
  };
  (timed as unknown as Obj)[PATCHED] = true;
  obj[name] = timed;
  return true;
}

/** The engine `target` looks like, if any. */
export type EngineKind = "phaser" | "pixi" | "three" | "kaplay" | "excalibur";

function kindOf(target: unknown): EngineKind | undefined {
  if (!target || typeof target !== "object") return undefined;
  const t = target as Obj;
  const scene = t.scene as Obj | undefined;
  if (scene && typeof scene.update === "function" && typeof scene.render === "function" && "renderer" in t) return "phaser";
  if (t.ticker && t.renderer && typeof (t.renderer as Obj).render === "function" && "stage" in t) return "pixi";
  if (t.isWebGLRenderer || t.isWebGPURenderer) return "three";
  if (typeof t.getTreeRoot === "function" && typeof t.loadSprite === "function") return "kaplay";
  if (typeof t.on === "function" && "currentScene" in t && "graphicsContext" in t) return "excalibur";
  return undefined;
}

const sceneKey = (sys: Obj) => ((sys.settings as Obj | undefined)?.key as string | undefined) ?? "scene";

/**
 * Add engine spans for a game object: a Phaser `Game`, a PixiJS `Application`, a three.js renderer,
 * a KAPLAY context (what `kaplay()` returns) or an Excalibur `Engine`.
 * Returns the engine it recognised, or `undefined` (nothing changed).
 *
 * ```ts
 * const game = new Phaser.Game(config);
 * adapt(profiler, game); // spans: update, render, and update:<scene key>
 * ```
 */
export function adapt(profiler: Profiler, target: unknown): EngineKind | undefined {
  const kind = kindOf(target);
  const t = target as Obj;
  if (kind === "phaser") {
    const scenes = t.scene as Obj;
    timeMethod(profiler, scenes, "render", "render");
    // Each scene's systems are wrapped the first time the manager updates them (scenes come and go).
    const wrapScenes = () => {
      for (const scene of (scenes.scenes as Obj[] | undefined) ?? []) {
        const sys = scene.sys as Obj | undefined;
        if (sys) timeMethod(profiler, sys, "step", (self) => `update:${sceneKey(self)}`);
      }
    };
    if (timeMethod(profiler, scenes, "update", "update")) {
      const timed = scenes.update as Fn;
      const withScenes = function (this: Obj, ...args: unknown[]) {
        wrapScenes();
        return timed.apply(this, args);
      };
      (withScenes as unknown as Obj)[PATCHED] = true;
      scenes.update = withScenes;
    }
  } else if (kind === "pixi") {
    adaptPixiApp(profiler, t);
  } else if (kind === "three") {
    timeMethod(profiler, t, "render", "render");
  } else if (kind === "kaplay") {
    // The tree root updates every object (and the game's onUpdate handlers), then draws them.
    const root = (t.getTreeRoot as () => Obj)();
    timeMethod(profiler, root, "update", "update");
    timeMethod(profiler, root, "draw", "render");
  } else if (kind === "excalibur" && !t[PATCHED]) {
    t[PATCHED] = true;
    // The engine's own events bracket its update and draw.
    const on = (t.on as (name: string, fn: () => void) => unknown).bind(t);
    const bracket = (pre: string, post: string, span: string) => {
      let start = 0;
      on(pre, () => {
        start = performance.now();
      });
      on(post, () => profiler.addSpan(span, performance.now() - start));
    };
    bracket("preupdate", "postupdate", "update");
    bracket("predraw", "postdraw", "render");
  }
  return kind;
}

/** PixiJS: game ticker callbacks between a first and a last listener, and the renderer. */
function adaptPixiApp(profiler: Profiler, app: Obj): void {
  if (app[PATCHED]) return;
  app[PATCHED] = true;
  timeMethod(profiler, app.renderer as Obj, "render", "render");
  const ticker = app.ticker as { add: (fn: () => void, ctx?: unknown, priority?: number) => void } | undefined;
  if (!ticker?.add) return;
  // Pixi runs ticker listeners by priority: HIGH 25 … LOW -25 (where the app renders). Bracket the game's.
  let start = 0;
  ticker.add(
    () => {
      start = performance.now();
    },
    undefined,
    1000,
  );
  ticker.add(() => profiler.addSpan("update", performance.now() - start), undefined, -24);
}

/**
 * Find engines as they start, where they announce themselves: PixiJS 8 (`__PIXI_APP_INIT__`), three.js
 * (`__THREE_DEVTOOLS__`), Excalibur (`___EXCALIBUR_DEVTOOL`), a global `Phaser` (Phaser 3, or any
 * script-tag build) and KAPLAY's globals. Returns a function
 * that stops watching. Already-patched objects stay patched (the spans just stop mattering).
 */
export function watchEngines(profiler: Profiler): () => void {
  const g = globalThis as unknown as Obj;
  const undo: (() => void)[] = [];

  // PixiJS 8: Application.init calls this hook (as the devtools do). Chain any existing hook.
  const previousPixi = g.__PIXI_APP_INIT__ as Fn | undefined;
  const pixiHook = (app: unknown, version: unknown) => {
    previousPixi?.(app, version);
    // Pixi calls this from one of its init plugins, and the ticker plugin may not have run yet:
    // finish once init's plugins have all run (they run synchronously, one after another).
    const a = app as Obj | undefined;
    if (kindOf(app) === "pixi") adaptPixiApp(profiler, app as Obj);
    else if (a?.renderer && "stage" in a) queueMicrotask(() => kindOf(app) === "pixi" && adaptPixiApp(profiler, a));
  };
  g.__PIXI_APP_INIT__ = pixiHook;
  undo.push(() => {
    if (g.__PIXI_APP_INIT__ === pixiHook) g.__PIXI_APP_INIT__ = previousPixi;
  });

  // three.js: renderers dispatch "observe" on this target when created. Reuse the devtools' if present.
  if (typeof EventTarget !== "undefined") {
    const created = g.__THREE_DEVTOOLS__ === undefined;
    const target = (g.__THREE_DEVTOOLS__ as EventTarget | undefined) ?? new EventTarget();
    const onObserve = (event: Event) => {
      const obj = (event as CustomEvent).detail;
      if (kindOf(obj) === "three") timeMethod(profiler, obj as Obj, "render", "render");
    };
    target.addEventListener("observe", onObserve);
    if (created) g.__THREE_DEVTOOLS__ = target;
    undo.push(() => {
      target.removeEventListener("observe", onObserve);
      if (created && g.__THREE_DEVTOOLS__ === target) delete g.__THREE_DEVTOOLS__;
    });
  }

  // Excalibur: each Engine stores itself in this global as it's constructed (for its devtools).
  const exKey = "___EXCALIBUR_DEVTOOL";
  if (!Object.getOwnPropertyDescriptor(g, exKey)?.set) {
    let engine = g[exKey];
    if (engine !== undefined) adapt(profiler, engine);
    Object.defineProperty(g, exKey, {
      configurable: true,
      get: () => engine,
      set: (value) => {
        engine = value;
        adapt(profiler, value);
      },
    });
    undo.push(() => {
      Object.defineProperty(g, exKey, { configurable: true, writable: true, value: engine });
    });
  }

  // Phaser with a global: patch the prototypes, so every game and scene is covered.
  const patchPhaser = () => {
    const scenes = (g.Phaser as Obj | undefined)?.Scenes as Obj | undefined;
    const manager = (scenes?.SceneManager as Obj | undefined)?.prototype as Obj | undefined;
    const systems = (scenes?.Systems as Obj | undefined)?.prototype as Obj | undefined;
    if (!manager || !systems) return false;
    timeMethod(profiler, manager, "update", "update");
    timeMethod(profiler, manager, "render", "render");
    timeMethod(profiler, systems, "step", (self) => `update:${sceneKey(self)}`);
    return true;
  };
  // KAPLAY with its globals (the default): `getTreeRoot` and friends appear on window.
  const patchKaplay = () => typeof g.getTreeRoot === "function" && adapt(profiler, g) === "kaplay";
  let phaser = patchPhaser();
  let kaplay = patchKaplay();
  if (!(phaser && kaplay) && typeof window !== "undefined") {
    // Engines that load after myaku: look again on the first frames, until they appear or a few seconds pass.
    let tries = 0;
    const unsubscribe = profiler.subscribe(() => {
      phaser ||= patchPhaser();
      kaplay ||= patchKaplay();
      if ((phaser && kaplay) || ++tries > 600) unsubscribe();
    });
    undo.push(unsubscribe);
  }

  return () => {
    for (const fn of undo.splice(0)) fn();
  };
}
