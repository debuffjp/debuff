import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

const template = fileURLToPath(new URL("../../../templates/basic", import.meta.url));

type ToolResult = { isError?: boolean; content: { type: string; text?: string; data?: string; mimeType?: string }[] };

describe("debuff MCP server", () => {
  const server = createServer({ root: template, version: "test" });
  const client = new Client({ name: "test", version: "0" });
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
  const data = async (name: string, args?: Record<string, unknown>) => {
    const result = await call(name, args);
    if (result.isError) throw new Error(result.content[0]?.text);
    return JSON.parse(result.content[0]?.text ?? "null");
  };

  beforeAll(async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
  });
  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it("lists its tools with descriptions and schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["inspect_project", "list_assets", "build", "run_scenarios", "game_start", "game_step", "game_capture"]),
    );
    expect(tools.every((t) => t.description && t.inputSchema)).toBe(true);
  });

  it("inspects the project", async () => {
    const info = await data("inspect_project");
    expect(info.name).toBe("@debuff/template-basic");
  });

  it("explains live tools need a running game", async () => {
    const result = await call("game_state");
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/game_start/);
  });

  it("plays the game: start, input, step, tune, capture", { timeout: 60_000 }, async () => {
    const started = await data("game_start", { mode: "headless" });
    expect(started.state).toMatchObject({ scene: "play", renderer: "webgl2" });

    await data("game_input", { action: "press", code: "ArrowRight" });
    const moved = await data("game_step", { steps: 30 });
    expect(moved.state.player.x).toBeGreaterThan(160);

    await data("game_set_param", { group: "player", key: "speed", value: 400 });
    expect((await data("game_params")).player.values.speed).toBe(400);
    expect((await call("game_set_param", { group: "player", key: "speed", value: 99999 })).isError).toBe(true);

    const shot = await call("game_capture");
    expect(shot.content[0]).toMatchObject({ type: "image", mimeType: "image/png" });
    expect(shot.content[0]?.data?.length).toBeGreaterThan(100);

    expect(await data("game_errors")).toEqual([]);
    await data("game_stop");
  });
});
