import { describe, expect, it } from "vitest";
import { Game, type Plugin } from "../src/index.js";
import { fakeCanvas } from "./helpers.js";

const makeGame = () => new Game({ canvas: fakeCanvas().canvas, width: 100, height: 100, scale: "none" });

describe("game.hooks", () => {
  it("fires lifecycle hooks in documented order", () => {
    const game = makeGame();
    const order: string[] = [];
    game.hooks.beforeUpdate(() => order.push("beforeUpdate"));
    game.hooks.afterUpdate(() => order.push("afterUpdate"));
    game.hooks.beforeRender(() => order.push("beforeRender"));
    game.hooks.afterRender(() => order.push("afterRender"));
    game.add({ id: "a", update: () => order.push("update"), render: () => order.push("render") }).go("a");
    game.step(1);
    expect(order).toEqual(["beforeUpdate", "update", "afterUpdate", "beforeRender", "render", "afterRender"]);
  });

  it("skips update hooks while frozen but keeps rendering", () => {
    const game = makeGame();
    const seen: string[] = [];
    game.hooks.afterUpdate(() => seen.push("update"));
    game.hooks.afterRender(() => seen.push("render"));
    game.freeze(1 / 60);
    game.step(1);
    expect(seen).toEqual(["render"]);
  });

  it("reports scene changes with the previous scene", () => {
    const game = makeGame();
    const changes: string[] = [];
    game.hooks.sceneChange((next, prev) => changes.push(`${prev?.id ?? "-"}>${next.id}`));
    game.add({ id: "a" }).add({ id: "b" });
    game.go("a");
    game.go("b");
    expect(changes).toEqual(["->a", "a>b"]);
  });

  it("unsubscribes and counts listeners", () => {
    const game = makeGame();
    let n = 0;
    const off = game.hooks.afterUpdate(() => n++);
    expect(game.hooks.counts().afterUpdate).toBe(1);
    off();
    game.step(1);
    expect(n).toBe(0);
    expect(game.hooks.counts().afterUpdate).toBe(0);
  });
});

describe("game.use", () => {
  const counter = (name = "counter"): Plugin & { cleaned: boolean } => {
    const plugin = {
      name,
      cleaned: false,
      install(game: Game) {
        let ticks = 0;
        const off = game.hooks.afterUpdate(() => ticks++);
        const unregister = game.inspect.register(name, () => ({ ticks }));
        return () => {
          off();
          unregister();
          plugin.cleaned = true;
        };
      },
    };
    return plugin;
  };

  it("installs, exposes inspect data and lists plugins", () => {
    const game = makeGame();
    game.use(counter());
    game.step(3);
    expect(game.plugins).toEqual(["counter"]);
    expect(game.inspect.snapshot()).toEqual({ counter: { ticks: 3 } });
  });

  it("rejects duplicates and non-kebab names", () => {
    const game = makeGame().use(counter());
    expect(() => game.use(counter())).toThrow(/already installed/);
    expect(() => game.use({ name: "BadName", install: () => undefined })).toThrow(/kebab-case/);
  });

  it("wraps install failures and leaves the name free", () => {
    const game = makeGame();
    const broken: Plugin = {
      name: "broken",
      install: () => {
        throw new Error("boom");
      },
    };
    expect(() => game.use(broken)).toThrow(/Plugin "broken" failed to install: boom/);
    expect(game.plugins).toEqual([]);
  });

  it("runs cleanups in reverse order on dispose", () => {
    const game = makeGame();
    const order: string[] = [];
    for (const name of ["first", "second"]) {
      game.use({ name, install: () => () => order.push(name) });
    }
    game.dispose();
    expect(order).toEqual(["second", "first"]);
    expect(game.plugins).toEqual([]);
  });
});

describe("game.inspect", () => {
  it("isolates failing providers and rejects duplicate names", () => {
    const game = makeGame();
    game.inspect.register("ok", () => 1);
    game.inspect.register("bad", () => {
      throw new Error("nope");
    });
    expect(game.inspect.snapshot()).toEqual({ ok: 1, bad: { error: "nope" } });
    expect(() => game.inspect.register("ok", () => 2)).toThrow(/already registered/);
  });
});

describe("game.emit", () => {
  it("delivers an event emitted by a listener after the current one reaches every listener", () => {
    const game = makeGame();
    const first: string[] = [];
    const second: string[] = [];
    game.hooks.gameEvent((name) => {
      first.push(name);
      if (name === "pop") game.emit("achievement");
    });
    game.hooks.gameEvent((name) => second.push(name));
    game.emit("pop");
    expect(first).toEqual(["pop", "achievement"]);
    expect(second).toEqual(["pop", "achievement"]);
  });

  it("keeps delivering after a listener throws", () => {
    const game = makeGame();
    const seen: string[] = [];
    game.hooks.gameEvent((name) => {
      if (name === "a") {
        game.emit("b");
        throw new Error("boom");
      }
    });
    game.hooks.gameEvent((name) => seen.push(name));
    expect(() => game.emit("a")).toThrow("boom");
    game.emit("c");
    expect(seen).toEqual(["c"]);
  });
});

describe("hooks.renderScene", () => {
  it("wraps beforeRender and the scene, nesting later wrappers outside, with afterRender outside all", () => {
    const game = makeGame();
    const order: string[] = [];
    game.hooks.beforeRender(() => order.push("beforeRender"));
    game.hooks.afterRender(() => order.push("afterRender"));
    game.hooks.renderScene((_draw, render) => {
      order.push("inner{");
      render();
      order.push("}inner");
    });
    const off = game.hooks.renderScene((_draw, render) => {
      order.push("outer{");
      render();
      order.push("}outer");
    });
    game.add({ id: "a", render: () => order.push("scene") }).go("a");
    game.redraw();
    expect(order).toEqual(["outer{", "inner{", "beforeRender", "scene", "}inner", "}outer", "afterRender"]);
    off();
    order.length = 0;
    game.redraw();
    expect(order).toEqual(["inner{", "beforeRender", "scene", "}inner", "afterRender"]);
  });
});
