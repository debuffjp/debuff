import { Game } from "@debuffjp/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { devTools } from "../src/index.js";

interface Registered {
  tool: { name: string; annotations: object; execute(input: object): Promise<{ content: { type: string; text?: string }[] }> };
  signal: AbortSignal;
}

function setup(webmcp?: boolean) {
  window.history.replaceState(null, "", "/");
  const registered: Registered[] = [];
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      registerTool: async (tool: Registered["tool"], { signal }: { signal: AbortSignal }) => void registered.push({ tool, signal }),
    },
  });
  const canvas = document.createElement("canvas");
  const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
  vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
    type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
  const game = new Game({ canvas, width: 100, height: 100, scale: "none" });
  let x = 0;
  game.params.define("player", { speed: { type: "number", default: 1, min: 0, max: 10 } });
  game.add({ id: "play", update: () => x++, inspect: () => ({ x }) }).go("play");
  game.use(devTools({ agentLink: false, webmcp }));
  const call = async (name: string, input: object = {}) => {
    const found = registered.find((r) => r.tool.name === name);
    if (!found) throw new Error(`${name} not registered`);
    return JSON.parse((await found.tool.execute(input)).content[0]?.text ?? "null");
  };
  return { game, registered, call };
}

afterEach(() => void delete (document as { modelContext?: unknown }).modelContext);

describe("WebMCP", () => {
  it("returns a tool's error as text instead of throwing", async () => {
    const { registered } = setup();
    const tool = registered.find((r) => r.tool.name === "game_input")?.tool;
    await expect(tool?.execute({ action: "press" })).resolves.toEqual({
      isError: true,
      content: [{ type: "text", text: "press needs a key code" }],
    });
  });

  it("marks the tools that return typed text as untrusted", () => {
    const { registered } = setup();
    const untrusted = registered.filter((r) => (r.tool.annotations as { untrustedContentHint: boolean }).untrustedContentHint);
    expect(untrusted.map((r) => r.tool.name).sort()).toEqual(["game_notes", "game_state"]);
  });

  it("registers the dev hooks under the @debuffjp/mcp tool names", async () => {
    const { registered, call } = setup();
    expect(registered.map((r) => r.tool.name)).toContain("game_step");
    expect((await call("game_step", { steps: 3 })).state).toEqual({ x: 3 });
    await call("game_set_param", { group: "player", key: "speed", value: 4 });
    expect((await call("game_params")).player.values.speed).toBe(4);
  });

  it("unregisters on dispose", () => {
    const { game, registered } = setup();
    game.dispose();
    expect(registered.every((r) => r.signal.aborted)).toBe(true);
  });

  it("stays off with webmcp: false", () => {
    expect(setup(false).registered).toHaveLength(0);
  });
});
