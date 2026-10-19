import { afterEach, describe, expect, it } from "vitest";
import { adapt, myaku, Profiler, watchEngines } from "../src/index.js";

type Obj = Record<string, unknown>;
const g = globalThis as unknown as Obj;
let now = 0;
const realNow = performance.now;
const busy = (ms: number) => () => {
  now += ms;
};

/** Run `run`, then read the spans accumulated for the frame in progress. */
function spansAfter(p: Profiler, run: () => void): Record<string, number> {
  run();
  const inner = p as unknown as { curSpans: Float64Array; spanNames: string[] };
  return Object.fromEntries(inner.spanNames.map((name, i) => [name, inner.curSpans[i] ?? 0]));
}

describe("engine adapters", () => {
  afterEach(() => {
    performance.now = realNow;
    (window as unknown as { __MYAKU__?: Profiler }).__MYAKU__?.stop();
    delete g.Phaser;
  });

  it("times a Phaser game's update, render and each scene", () => {
    performance.now = () => now;
    const p = new Profiler({ global: false });
    const level = { sys: { settings: { key: "level" }, step: busy(3) } };
    const scenes = {
      scenes: [level],
      update(this: { scenes: (typeof level)[] }) {
        for (const s of this.scenes) s.sys.step();
        now += 1;
      },
      render: busy(2),
    };
    const game = { scene: scenes, renderer: {} };
    expect(adapt(p, game)).toBe("phaser");
    expect(adapt(p, game)).toBe("phaser"); // idempotent
    const spans = spansAfter(p, () => {
      scenes.update();
      scenes.render();
    });
    expect(spans).toEqual({ update: 4, "update:level": 3, render: 2 });
  });

  it("times a PixiJS app's ticker listeners and renderer", () => {
    performance.now = () => now;
    const p = new Profiler({ global: false });
    const listeners: { fn: () => void; priority: number }[] = [];
    const app = {
      stage: {},
      renderer: { render: busy(5) },
      ticker: { add: (fn: () => void, _ctx: unknown, priority = 0) => listeners.push({ fn, priority }) },
    };
    app.ticker.add(busy(7), undefined, 0); // the game's own update
    expect(adapt(p, app)).toBe("pixi");
    const spans = spansAfter(p, () => {
      for (const l of [...listeners].sort((a, b) => b.priority - a.priority)) l.fn();
      app.renderer.render();
    });
    expect(spans).toEqual({ render: 5, update: 7 });
  });

  it("finds PixiJS and three.js through their devtools hooks, and Phaser through its global", () => {
    performance.now = () => now;
    let chained = 0;
    g.__PIXI_APP_INIT__ = () => chained++;
    const p = myaku({ global: true });
    const pixiApp = { stage: {}, renderer: { render: busy(1) }, ticker: { add: () => {} } };
    (g.__PIXI_APP_INIT__ as (app: unknown, v: string) => void)(pixiApp, "8.0.0");
    expect(chained).toBe(1);
    const renderer = { isWebGLRenderer: true, render: busy(2) };
    (g.__THREE_DEVTOOLS__ as EventTarget).dispatchEvent(new CustomEvent("observe", { detail: renderer }));
    const Systems = class {
      settings = { key: "menu" };
      step() {
        now += 4;
      }
    };
    const SceneManager = class {
      update() {
        now += 1;
      }
      render() {
        now += 1;
      }
    };
    g.Phaser = { Scenes: { Systems, SceneManager } };
    // Phaser appeared after myaku started: picked up on a later frame.
    for (const fn of (p as unknown as { listeners: Set<(p: Profiler) => void> }).listeners) fn(p);
    const spans = spansAfter(p, () => {
      pixiApp.renderer.render();
      renderer.render();
      new Systems().step();
      new SceneManager().update();
    });
    expect(spans).toEqual({ render: 3, "update:menu": 4, update: 1 });
    p.stop();
    expect(g.__PIXI_APP_INIT__).toBeTypeOf("function"); // the earlier hook is back
    expect(g.__THREE_DEVTOOLS__).toBeUndefined();
    delete g.__PIXI_APP_INIT__;
  });

  it("times a KAPLAY context's tree update and draw, and an Excalibur engine's through its events", () => {
    performance.now = () => now;
    const p = new Profiler({ global: false });
    const root = { update: busy(3), draw: busy(2) };
    const k = { getTreeRoot: () => root, loadSprite: () => {} };
    expect(adapt(p, k)).toBe("kaplay");
    const handlers: Record<string, (() => void)[]> = {};
    const engine = {
      currentScene: {},
      graphicsContext: {},
      on: (name: string, fn: () => void) => {
        handlers[name] = [...(handlers[name] ?? []), fn];
      },
    };
    expect(adapt(p, engine)).toBe("excalibur");
    adapt(p, engine); // idempotent
    const emit = (name: string) => {
      for (const fn of handlers[name] ?? []) fn();
    };
    const spans = spansAfter(p, () => {
      root.update();
      root.draw();
      emit("preupdate");
      now += 4;
      emit("postupdate");
      emit("predraw");
      now += 1;
      emit("postdraw");
    });
    expect(spans).toEqual({ update: 7, render: 3 });
  });

  it("finds Excalibur through its devtools global, and KAPLAY through its globals", () => {
    performance.now = () => now;
    const p = myaku({ global: true });
    const handlers: Record<string, (() => void)[]> = {};
    const engine = {
      currentScene: {},
      graphicsContext: {},
      on: (n: string, fn: () => void) => {
        handlers[n] = [...(handlers[n] ?? []), fn];
      },
    };
    g.___EXCALIBUR_DEVTOOL = engine;
    expect(g.___EXCALIBUR_DEVTOOL).toBe(engine);
    expect(handlers.preupdate).toHaveLength(1);
    const root = { update: busy(3), draw: busy(2) };
    g.getTreeRoot = () => root;
    g.loadSprite = () => {};
    for (const fn of (p as unknown as { listeners: Set<(p: Profiler) => void> }).listeners) fn(p);
    const spans = spansAfter(p, () => {
      root.update();
      root.draw();
    });
    expect(spans).toEqual({ update: 3, render: 2 });
    p.stop();
    expect(g.___EXCALIBUR_DEVTOOL).toBe(engine);
    delete g.___EXCALIBUR_DEVTOOL;
    delete g.getTreeRoot;
    delete g.loadSprite;
  });

  it("finishes a PixiJS app whose ticker is set up after the devtools hook runs", async () => {
    performance.now = () => now;
    const p = myaku({ global: true });
    const app: Obj = { stage: {}, renderer: { render: busy(2) } };
    (g.__PIXI_APP_INIT__ as (app: unknown, v: string) => void)(app, "8.14.1");
    app.ticker = { add: () => {} };
    await Promise.resolve();
    const spans = spansAfter(p, () => (app.renderer as { render: () => void }).render());
    expect(spans).toEqual({ render: 2 });
    p.stop();
  });

  it("ignores objects that aren't engines, and can be turned off", () => {
    const p = new Profiler({ global: false });
    expect(adapt(p, {})).toBeUndefined();
    expect(adapt(p, null)).toBeUndefined();
    const stop = watchEngines(p);
    stop();
    const quiet = myaku({ engines: false });
    expect(g.__THREE_DEVTOOLS__).toBeUndefined();
    quiet.stop();
  });
});
