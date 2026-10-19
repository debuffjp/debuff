import { afterEach, describe, expect, it } from "vitest";
import { watchEngines } from "../src/engines.js";

type Obj = Record<string, unknown>;
const g = globalThis as unknown as Obj;
const bounds = (x: number, y: number, width: number, height: number) => () => ({ x, y, width, height });

afterEach(() => {
  delete g.Phaser;
  delete g.__PIXI_APP_INIT__;
});

describe("engine introspection", () => {
  it("reads a PixiJS app's screens and pressable objects, in page pixels", () => {
    const watch = watchEngines({} as Window);
    class TiledBackground {
      children = [];
    }
    class LargeButton {
      eventMode = "static";
      children = [{ text: "Start Game", children: [] }];
      getBounds = bounds(900, 820, 200, 100);
    }
    class Parked {
      eventMode = "static";
      children = [];
      getBounds = bounds(900, 5000, 200, 100); // waiting below the screen to slide in
    }
    class HomeScreen {
      children = [new LargeButton(), new Parked(), { eventMode: "static", alpha: 0, children: [], getBounds: bounds(0, 0, 10, 10) }];
    }
    class LoadingScreen {
      visible = false;
      children = [];
    }
    class Container {
      constructor(readonly children: unknown[]) {}
    }
    const app = {
      stage: { children: [new TiledBackground(), new Container([new LoadingScreen(), new HomeScreen()])] },
      renderer: { width: 1920, height: 1080, canvas: { clientWidth: 960 } },
    };
    expect(watch.info()).toBeUndefined();
    (g.__PIXI_APP_INIT__ as (app: unknown, v: string) => void)(app, "8.14.1");
    expect(watch.info()).toEqual({
      name: "pixi",
      scene: "HomeScreen",
      scenes: ["TiledBackground", "HomeScreen"],
      targets: [{ type: "LargeButton", text: "Start Game", x: 500, y: 435, width: 100, height: 50 }],
    });
    // A screen that isn't taking input (mid-transition) offers nothing to press.
    (app.stage.children[1] as { children: Obj[] }).children[1]!.interactiveChildren = false;
    expect(watch.info()?.targets).toEqual([]);
    watch.dispose();
    expect(g.__PIXI_APP_INIT__).toBeUndefined();
  });

  it("finds a Phaser game through its global, and reads active scenes and interactive objects", () => {
    const watch = watchEngines({} as Window);
    const SceneManager = class {
      game: unknown;
      update() {}
    };
    g.Phaser = { Scenes: { SceneManager } };
    expect(watch.info()).toBeUndefined(); // patched now, caught on the next update
    const play = {
      type: "Text",
      text: "PLAY",
      input: { enabled: true },
      getBounds: bounds(250, 140, 100, 20),
    };
    const off = { type: "Image", input: { enabled: false }, getBounds: bounds(0, 0, 10, 10) };
    const scene = (key: string, list: unknown[]) => ({ sys: { settings: { key }, displayList: { list } } });
    const manager = new SceneManager();
    manager.game = {
      scene: { getScenes: () => [scene("background", []), scene("menu", [off, play])] },
      scale: { displayScale: { x: 2, y: 2 }, canvasBounds: { x: 10, y: 20, width: 300, height: 150 } },
    };
    manager.update();
    expect(watch.info()).toEqual({
      name: "phaser",
      scene: "menu",
      scenes: ["background", "menu"],
      targets: [{ type: "Text", text: "PLAY", x: 160, y: 95, width: 50, height: 10 }],
    });
    watch.dispose();
  });
});
