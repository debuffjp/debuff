import { Game, type GameOptions } from "./game.js";

/**
 * A `Game` for unit tests under happy-dom or jsdom, which have no WebGL2 or 2D canvas. Drawing goes to a
 * no-op Canvas 2D context, so hooks, scenes, params, inspect and plugins all run; nothing is rendered.
 * Time only moves when you call `game.step()`.
 *
 * ```ts
 * import { createTestGame } from "@debuffjp/core/testing";
 * const game = createTestGame();
 * game.use(myPlugin());
 * game.emit("coin");
 * expect(game.inspect.snapshot()["my-plugin"]).toEqual({ coins: 1 });
 * ```
 */
export function createTestGame(options: Partial<GameOptions> = {}): Game {
  const canvas = options.canvas ?? document.createElement("canvas");
  if (!canvas.isConnected) document.body.append(canvas);
  const noop = () => {};
  const ctx = new Proxy(
    { canvas, fillStyle: "", globalAlpha: 1, globalCompositeOperation: "source-over" } as Record<PropertyKey, unknown>,
    {
      get: (target, key) => (key in target ? target[key] : noop),
    },
  );
  canvas.getContext = ((type: string) => (type === "2d" ? ctx : null)) as typeof canvas.getContext;
  return new Game({ width: 100, height: 100, scale: "none", ...options, canvas });
}
