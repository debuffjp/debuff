import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";
import { summarizeFrames } from "../src/server.js";

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

  it("type-checks the project without a browser", async () => {
    expect(await data("typecheck")).toMatchObject({ ok: true, diagnostics: [] });
  });

  it("offers workflow prompts that fill in their arguments", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(["playtest", "fix-errors", "tune-feel", "add-mechanic", "explain-stutter"]);
    const got = await client.getPrompt({ name: "add-mechanic", arguments: { mechanic: "a double jump" } });
    const text = got.messages[0]?.content.type === "text" ? got.messages[0].content.text : "";
    expect(text).toContain("a double jump");
    expect(text).toContain("run_scenarios");
    expect(text).toMatch(/creative calls/);
  });

  it("fuzzes the game deterministically and reports nothing on the healthy template", async () => {
    const a = await data("fuzz", { runs: 1, seconds: 5, seed: 7 });
    expect(a).toMatchObject({ seed: 7, runs: 1, steps: expect.any(Number), findings: [] });
    expect(a.steps).toBeGreaterThanOrEqual(300);
  }, 120_000);

  it("inspects the project", async () => {
    const info = await data("inspect_project");
    expect(info.name).toBe("@debuffjp/template-basic");
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

    const quiet = await data("game_step", { steps: 1, quiet: true });
    expect(quiet).toHaveProperty("tick");
    expect(quiet).not.toHaveProperty("state");

    const summary = await data("game_frames", { summary: true });
    expect(summary).toMatchObject({ updateMs: { p50: expect.any(Number) }, drawCalls: { max: expect.any(Number) } });
    expect(summary.worst.length).toBeLessThanOrEqual(3);

    const unknown = await call("game_command", { name: "warp", args: [1] });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0]?.text).toBe('Unknown command "warp". Registered: none');

    const profile = await call("game_profile");
    expect(profile.isError).toBe(true);
    expect(profile.content[0]?.text).toMatch(/live mode/);

    const dir = mkdtempSync(join(tmpdir(), "debuff-capture-"));
    const saved = await call("game_capture", { path: relative(template, join(dir, "shot.png")) });
    expect(saved.isError).toBe(true); // outside the project root
    rmSync(dir, { recursive: true, force: true });
    await data("game_stop");
  });

  it("starts at a viewport with reduced motion forced, and saves captures", { timeout: 60_000 }, async () => {
    const started = await data("game_start", { mode: "headless", viewport: [390, 844], reducedMotion: true });
    expect(started.state).toMatchObject({ reducedMotion: true, reducedMotionForced: true });
    const shot = await call("game_capture", { path: ".debuff/test-capture.png" });
    expect(JSON.parse(shot.content[1]?.text ?? "{}")).toEqual({ saved: ".debuff/test-capture.png" });
    const file = join(template, ".debuff/test-capture.png");
    expect(readFileSync(file).subarray(1, 4).toString()).toBe("PNG");
    rmSync(file);
    await data("game_stop");
  });

  it("summarizes frames", () => {
    const frames = [1, 2, 3, 4].map((n) => ({ updateMs: n, renderMs: 1, quads: n * 10, drawCalls: 1 }));
    const s = summarizeFrames(frames);
    expect(s).toMatchObject({ count: 4, updateMs: { p50: 3, max: 4 }, quads: { max: 40 } });
    expect(s.worst.map((f) => f.updateMs)).toEqual([4, 3, 2]);
  });
});
