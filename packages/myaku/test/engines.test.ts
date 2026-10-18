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
