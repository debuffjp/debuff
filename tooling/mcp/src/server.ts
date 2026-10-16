import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { buildReport, compileAssets, findUnused, inspectProject, loadConfig, runFuzz, runScenarios, viteConfig } from "@debuffjp/cli";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerPrompts } from "./prompts.js";
import { type GameSession, startSession } from "./session.js";

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

export interface ServerOptions {
  /** Default project root for tools that don't receive one. */
  root: string;
  version: string;
}

/**
 * debuff's MCP server: project tools (inspect, assets, build, scenarios) and live-game tools that drive
 * a running game through the same dev hooks scenarios use. Every result is JSON, plus images for captures.
 */
export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer(
    { name: "debuff", version: options.version },
    {
      instructions:
        "Tools for building 2D web games with debuff. Start with inspect_project. To see the game, call game_start, then game_state / game_capture. " +
        "If the human has the game open under `debuff dev`, game_start attaches to it (mode live): they see your actions in their overlay, and their " +
        "flagged moments are in game_notes, so read those first. Otherwise you get a private paused copy (mode headless) where time only advances through game_step. " +
        "Use game_pause before inspecting a live game, and game_frames to explain stutter. Prompts (playtest, fix-errors, tune-feel, add-mechanic, explain-stutter) give step-by-step workflows. Prefer tuning params (game_params, game_set_param) over code changes, " +
        "and verify changes with run_scenarios. Creative direction belongs to the human: propose alternatives rather than deciding art or feel.",
    },
  );
  const rootOf = (root?: string) => resolve(options.root, root ?? ".");
  let session: GameSession | undefined;
  const live = () => {
    if (!session) throw new Error("No game running. Call game_start first.");
    return session;
  };
  const safely =
    <A>(fn: (args: A) => Promise<{ content: Content[] }>) =>
    async (args: A) => {
      try {
        return await fn(args);
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    };
  const root = { root: z.string().optional().describe("Project root, relative to the server's root. Default: the server's root.") };

  // ---- project tools -------------------------------------------------------------------------

  server.registerTool(
    "inspect_project",
    {
      title: "Inspect project",
      description: "Summary of the project: dependencies, plugins and their contributions, assets, last build size.",
      inputSchema: root,
      annotations: { readOnlyHint: true },
    },
    safely(async ({ root: r }) => json(await inspectProject(rootOf(r)))),
  );

  server.registerTool(
    "list_assets",
    {
      title: "List assets",
      description:
        "Run the asset pipeline: every asset id, type, size and importer, plus generated files, warnings and possibly unused ids.",
      inputSchema: root,
      annotations: { readOnlyHint: true },
    },
    safely(async ({ root: r }) => {
      const dir = rootOf(r);
      const { plugins, atlas } = await loadConfig(dir);
      const { manifest, importedBy, outputs, warnings } = await compileAssets(dir, { plugins, atlas });
      return json({ assets: manifest.assets, importedBy, generated: [...outputs.keys()], warnings, unused: findUnused(dir, manifest) });
    }),
  );

  server.registerTool(
    "build",
    {
      title: "Production build",
      description:
        "Build for production and return the size report (raw, gzip, brotli per file). `leaks` lists dev-only code found in the output; it must be empty.",
      inputSchema: root,
    },
    safely(async ({ root: r }) => {
      const dir = rootOf(r);
      const { build } = await import("vite");
      await build(await viteConfig(dir, { logLevel: "silent" }));
      return json(buildReport(resolve(dir, "dist")));
    }),
  );

  server.registerTool(
    "run_scenarios",
    {
      title: "Run scenarios",
      description:
        "Run scenarios/*.json (or the given files) in a headless browser. Returns per-step results, runtime errors, captures and final state.",
      inputSchema: {
        ...root,
        files: z.array(z.string()).optional().describe("Scenario files relative to the root. Default: all."),
        update: z.boolean().optional().describe("Accept new captures as baselines. Only when the human has approved the visual change."),
      },
    },
    safely(async ({ root: r, files, update }) => {
      const dir = rootOf(r);
      const { plugins } = await loadConfig(dir);
      const reports = await runScenarios({ root: dir, files: files ?? [], plugins, update: update ?? false, strict: false });
      return json({ passed: reports.filter((x) => x.ok).length, total: reports.length, reports });
    }),
  );

  server.registerTool(
    "fuzz",
    {
      title: "Fuzz playtest",
      description:
        "Play the game headlessly with random but plausible input (movement keys held, action keys tapped) to find runtime errors, stuck states and back-and-forth loops. " +
        "Each finding includes the explained error (kind, source-mapped file:line, hint) and `repro`: a scenario file that replays it exactly. " +
        "Pass that file to run_scenarios to reproduce, then again after fixing to verify. The same seed gives the same inputs.",
      inputSchema: {
        ...root,
        seconds: z.number().min(1).max(600).optional().describe("Simulated seconds of play per run. Default 60."),
        runs: z.number().int().min(1).max(20).optional().describe("Independent runs. Default 3."),
        seed: z.number().int().optional().describe("Input seed; reuse it to repeat a run exactly."),
        keys: z.array(z.string()).optional().describe("KeyboardEvent.code values to press. Default: arrows, WASD, Space, Enter, Z, X."),
      },
    },
    safely(async ({ root: r, seconds, runs, seed, keys }) =>
      json(
        await runFuzz({
          root: rootOf(r),
          ...(seconds === undefined ? {} : { seconds }),
          ...(runs === undefined ? {} : { runs }),
          ...(seed === undefined ? {} : { seed }),
          ...(keys ? { keys } : {}),
        }),
      ),
    ),
  );

  // ---- live game tools -----------------------------------------------------------------------

  server.registerTool(
    "game_start",
    {
      title: "Start game",
      description:
        "Connect to the game. auto (default): attach to the human's live game if `debuff dev` has it open in a browser, else start a private " +
        "headless copy, paused. Returns the mode, state and how many notes the human has flagged. Replaces any running session.",
      inputSchema: {
        ...root,
        page: z.string().optional().describe('Path to open in headless mode. Default "/".'),
        mode: z.enum(["auto", "live", "headless"]).optional().describe("Default auto."),
      },
    },
    safely(async ({ root: r, page, mode }) => {
      await session?.stop();
      session = undefined;
      session = await startSession(rootOf(r), { ...(page ? { page } : {}), ...(mode ? { mode } : {}) });
      return json({ mode: session.mode, url: session.url, state: await session.call("state") });
    }),
  );

  server.registerTool(
    "game_state",
    {
      title: "Game state",
      description: "Current scene, tick, time, renderer, frame stats, the scene's inspect() data and plugin inspect data.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safely(async () => json(await live().call("state"))),
  );

  server.registerTool(
    "game_step",
    {
      title: "Advance time",
      description: "Advance the simulation by fixed steps (60 per second by default) and return the new state.",
      inputSchema: { steps: z.number().int().min(1).max(36_000).describe("Fixed simulation steps to run.") },
    },
    safely(async ({ steps }) => json(await live().call("step", steps))),
  );

  server.registerTool(
    "game_input",
    {
      title: "Send input",
      description:
        "Keyboard or pointer input. press/release take a KeyboardEvent.code (e.g. Space, ArrowLeft, KeyZ). tap/pointer_down/pointer_move take logical x, y. " +
        "Input takes effect on the next game_step.",
      inputSchema: {
        action: z.enum(["press", "release", "tap", "pointer_down", "pointer_move", "pointer_up"]),
        code: z.string().optional().describe("For press/release."),
        x: z.number().optional(),
        y: z.number().optional(),
      },
    },
    safely(async ({ action, code, x, y }) => {
      const s = live();
      if (action === "press" || action === "release") {
        if (!code) throw new Error(`${action} needs a key code`);
        await s.call(action, code);
      } else if (action === "pointer_up") {
        await s.call("pointerUp");
      } else {
        if (x === undefined || y === undefined) throw new Error(`${action} needs x and y`);
        await s.call({ tap: "tap", pointer_down: "pointerDown", pointer_move: "pointerMove" }[action], x, y);
      }
      return json({ ok: true });
    }),
  );

  server.registerTool(
    "game_params",
    {
      title: "List params",
      description: "Every tunable param group: schema (type, default, min, max, units, description) and current values.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safely(async () => json(await live().call("params"))),
  );

  server.registerTool(
    "game_set_param",
    {
      title: "Set param",
      description:
        "Set a tunable param live. Values are validated against the param's type and range. Changes last until game_start or a reload.",
      inputSchema: { group: z.string(), key: z.string(), value: z.union([z.number(), z.boolean()]) },
    },
    safely(async ({ group, key, value }) => {
      await live().call("setParam", group, key, value);
      return json({ ok: true, group, key, value });
    }),
  );

  server.registerTool(
    "game_capture",
    {
      title: "Capture frame",
      description: "Screenshot of the current frame as a PNG image.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safely(async () => {
      const dataUrl = await live().call<string>("capture");
      return { content: [{ type: "image" as const, data: dataUrl.slice(dataUrl.indexOf(",") + 1), mimeType: "image/png" }] };
    }),
  );

  server.registerTool(
    "game_pause",
    {
      title: "Pause or resume",
      description: "Pause or resume a live game (headless games are always paused). game_step also pauses first.",
      inputSchema: { paused: z.boolean() },
    },
    safely(async ({ paused }) => json(await live().call(paused ? "pause" : "resume"))),
  );

  server.registerTool(
    "game_frames",
    {
      title: "Frame breakdown",
      description:
        "Recent frames, oldest first: intervalMs (what the player feels), updateMs, renderMs, steps (>1 means catching up), quads, drawCalls and " +
        "longTaskMs (browser-reported main-thread stalls). Use it to explain stutter; in headless mode times reflect stepping, not real play.",
      inputSchema: { count: z.number().int().min(1).max(240).optional().describe("Default 60.") },
      annotations: { readOnlyHint: true },
    },
    safely(async ({ count }) => json(await live().call("frames", count ?? 60))),
  );

  server.registerTool(
    "game_notes",
    {
      title: "Human notes",
      description:
        "Moments the human flagged in the overlay (live mode): their words, the tick, the scene's inspect() state then, and the frames leading up to it.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safely(async () => json(await live().call("notes"))),
  );

  server.registerTool(
    "game_replay",
    {
      title: "Save a replay",
      description:
        "Everything played since the game loaded (keys, pointer, param changes) up to `toTick` (default: now), saved as a scenario " +
        "in .debuff/replays/ that replays it exactly. Use a note's `tick` to reproduce what the human saw when they flagged it, then " +
        "run_scenarios with the returned file. `warnings` lists anything a replay can't reproduce (for example slow motion).",
      inputSchema: { toTick: z.number().int().min(0).optional().describe("Last tick to include. Default: the current tick.") },
    },
    safely(async ({ toTick }) => {
      const replay = await live().call<{ name: string; steps: unknown[]; ticks: number; warnings: string[] }>(
        "replay",
        ...(toTick === undefined ? [] : [toTick]),
      );
      const dir = join(options.root, ".debuff", "replays");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `replay-tick-${replay.ticks}.json`);
      writeFileSync(file, `${JSON.stringify({ name: replay.name, steps: replay.steps }, null, 2)}\n`);
      return json({
        file: relative(options.root, file).split("\\").join("/"),
        ticks: replay.ticks,
        steps: replay.steps.length,
        warnings: replay.warnings,
      });
    }),
  );

  server.registerTool(
    "game_errors",
    {
      title: "Runtime errors",
      description:
        "Runtime errors since the game started, explained: kind (your-code, debuff-usage, debuff-bug, outside), where (source file:line, " +
        "source-mapped), a hint, the loop phase and tick, and a repeat count. A loop error stops the game; fix it, then game_pause false to resume. " +
        "For debuff-bug, tell the human and share reportUrl rather than working around it.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safely(async () => json(await live().call("errors"))),
  );

  server.registerTool(
    "game_stop",
    {
      title: "Stop game",
      description: "Headless: close the browser and dev server. Live: resume the human's game and disconnect.",
      inputSchema: {},
    },
    safely(async () => {
      await session?.stop();
      session = undefined;
      return json({ ok: true });
    }),
  );

  registerPrompts(server);

  const close = server.close.bind(server);
  server.close = async () => {
    await session?.stop();
    session = undefined;
    await close();
  };
  return server;
}
