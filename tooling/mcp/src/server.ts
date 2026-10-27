import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  buildReport,
  checkSaves,
  compileAssets,
  findUnused,
  inspectProject,
  loadConfig,
  runDoctor,
  runFuzz,
  runScenarios,
  typecheck,
  viteConfig,
} from "@debuffjp/cli";
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
        "Tools for building 2D web games with debuff. Start with inspect_project; if a tool fails on setup (packages, config, browser), call doctor.To see the game, call game_start, then game_state / game_capture. " +
        "If the human has the game open under `debuff dev`, game_start attaches to it (mode live): they see your actions in their overlay, and their " +
        "flagged moments are in game_notes, so read those first. Otherwise you get a private paused copy (mode headless) where time only advances through game_step. " +
        "Use game_pause before inspecting a live game, and game_profile to explain stutter (game_frames for raw numbers). Prompts (playtest, fix-errors, tune-feel, add-mechanic, explain-stutter) give step-by-step workflows. Prefer tuning params (game_params, game_set_param) over code changes, " +
        "and verify changes with run_tests (fast logic tests in tests/, no browser) and run_scenarios (screenshots). Creative direction belongs to the human: propose alternatives rather than deciding art or feel. " +
        "When the game needs pixel art drawn and the human has not named a tool, draw it with the tenten MCP server (tt_new, tt_draw, tt_save to assets/<name>.tt) rather than writing image bytes by hand.",
    },
  );
  const rootOf = (root?: string) => resolve(options.root, root ?? ".");
  let session: GameSession | undefined;
  /** The running session's project root, for files tools write (captures). */
  let sessionRoot = options.root;
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
  const root = {
    root: z.string().optional().describe("Project root. Absolute path, or relative to the server's root. Default: the server's root."),
  };

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
    "doctor",
    {
      title: "Check setup",
      description:
        "Check the project's setup in one pass: Node, debuff package versions, node_modules, debuff.config.ts, assets, saves.json, agent files and the browser. " +
        "Every check has an id, ok, a message and a fix; ok is false only when a required check failed. Call it when another tool fails on setup. " +
        "live: true also starts the dev server and waits for the game's dev hooks (about 5 to 15 s).",
      inputSchema: { ...root, live: z.boolean().optional().describe("Also boot the game and check its dev hooks. Default false.") },
      annotations: { readOnlyHint: true },
    },
    safely(async ({ root: r, live }) => json(await runDoctor(rootOf(r), { live: live ?? false }))),
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
    "typecheck",
    {
      title: "Type-check",
      annotations: { readOnlyHint: true },
      description:
        "Type-check the project with its own tsc (no emit, no browser needed). Returns diagnostics: file (relative to the root), " +
        "line, column, TypeScript code and message. Run it after editing code; vite doesn't type-check, so the game can run with type errors.",
      inputSchema: root,
    },
    safely(async ({ root: r }) => json(await typecheck(rootOf(r)))),
  );

  server.registerTool(
    "build",
    {
      title: "Production build",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description:
        "Build for production and return the size report (raw, gzip, brotli per file). `leaks` lists dev-only code found in the output; it must be empty. " +
        "`saves` compares the game's saves with saves.json: an error means players would lose saved progress. Don't accept save changes yourself; tell the human (they run `debuff build --accept-saves`).",
      inputSchema: root,
    },
    safely(async ({ root: r }) => {
      const dir = rootOf(r);
      const { build } = await import("vite");
      await build(await viteConfig(dir, { logLevel: "silent" }));
      const saves = checkSaves(dir);
      return json({ ...buildReport(resolve(dir, "dist")), ...(saves ? { saves } : {}) });
    }),
  );

  server.registerTool(
    "run_tests",
    {
      title: "Run logic tests",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description:
        "Run the logic tests in tests/**/*.test.ts (keiko): the real game in Node, no browser, in milliseconds. Each failure has its message, " +
        "the source line, and the game's tick, scene and state when it failed. Use after every change; write a test for each mechanic you add.",
      inputSchema: {
        ...root,
        files: z.array(z.string()).optional().describe("Test files relative to the root. Default: all."),
        filter: z.string().optional().describe("Only run tests whose name contains this text."),
      },
    },
    safely(async ({ root: r, files, filter }) => {
      const dir = rootOf(r);
      const { runTests } = await import("keiko/runner");
      const report = await runTests({ root: dir, files: files ?? [], vite: await viteConfig(dir), ...(filter ? { filter } : {}) });
      // Passing tests don't need their (empty) logs or details; keep the result small for the agent.
      return json({
        ...report,
        results: report.results.map((x) => (x.status === "fail" ? x : { fullName: x.fullName, file: x.file, status: x.status })),
      });
    }),
  );

  server.registerTool(
    "run_scenarios",
    {
      title: "Run scenarios",
      annotations: { readOnlyHint: false, destructiveHint: false },
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
      const { plugins, viewport } = await loadConfig(dir);
      const reports = await runScenarios({
        root: dir,
        files: files ?? [],
        plugins,
        update: update ?? false,
        strict: false,
        ...(viewport ? { viewport } : {}),
      });
      return json({ passed: reports.filter((x) => x.ok).length, total: reports.length, reports });
    }),
  );

  server.registerTool(
    "fuzz",
    {
      title: "Fuzz playtest",
      annotations: { readOnlyHint: false, destructiveHint: false },
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
      annotations: { readOnlyHint: false, destructiveHint: false },
      description:
        "Connect to the game. auto (default): attach to the human's live game if `debuff dev` has it open in a browser, else start a private " +
        "headless copy, paused. Returns the mode, state and how many notes the human has flagged. Replaces any running session.",
      inputSchema: {
        ...root,
        page: z.string().optional().describe('Path to open in headless mode. Default "/".'),
        mode: z.enum(["auto", "live", "headless"]).optional().describe("Default auto."),
        viewport: z
          .tuple([z.number().int().min(64).max(4096), z.number().int().min(64).max(4096)])
          .optional()
          .describe(
            'Headless only: browser viewport [width, height] in CSS pixels. Default [960, 540]. Try [390, 844] to test a scale: "expand" game in phone portrait.',
          ),
        reducedMotion: z
          .boolean()
          .optional()
          .describe(
            "Force game.reducedMotion on or off for this session. Default: leave it; the state's reducedMotion says what it is. When true, games may freeze animations.",
          ),
      },
    },
    safely(async ({ root: r, page, mode, viewport, reducedMotion }) => {
      await session?.stop();
      session = undefined;
      sessionRoot = rootOf(r);
      session = await startSession(sessionRoot, {
        ...(page ? { page } : {}),
        ...(mode ? { mode } : {}),
        ...(viewport ? { width: viewport[0], height: viewport[1] } : {}),
      });
      const warnings: string[] = [];
      if (viewport && session.mode === "live") warnings.push("viewport only applies to headless mode; the human's tab keeps its size");
      if (reducedMotion !== undefined) {
        // An older @debuffjp/dev has no reducedMotion hook: keep the session and say so, rather than failing the start.
        await session.call("reducedMotion", reducedMotion).catch((err: unknown) => {
          warnings.push(`reducedMotion not applied: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
      return json({
        mode: session.mode,
        url: session.url,
        ...(warnings.length ? { warnings } : {}),
        state: await session.call("state"),
      });
    }),
  );

  server.registerTool(
    "game_state",
    {
      title: "Game state",
      description:
        "Current scene, tick, time, logical width and height, renderer, frame stats, the scene's inspect() data and plugin inspect data. " +
        "reducedMotion true means the game may freeze or tone down its animations (reducedMotionForced: game_start forced it).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safely(async () => json(await live().call("state"))),
  );

  server.registerTool(
    "game_step",
    {
      title: "Advance time",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: "Advance the simulation by fixed steps (60 per second by default) and return the new state.",
      inputSchema: {
        steps: z.number().int().min(1).max(36_000).describe("Fixed simulation steps to run."),
        quiet: z.boolean().optional().describe("Leave out the scene's inspect() state and plugin data, to keep the result short."),
      },
    },
    safely(async ({ steps, quiet }) => {
      const state = await live().call<Record<string, unknown>>("step", steps);
      if (!quiet) return json(state);
      const { state: _scene, plugins: _plugins, ...rest } = state;
      return json(rest);
    }),
  );

  server.registerTool(
    "game_command",
    {
      title: "Run a game command",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description:
        "Run a command the game registered with devTools({ commands }) (warp to a level, grant an item, select a cell), like a scenario's " +
        "{ command, args } step; recorded in replays. Prefer it over computing screen coordinates for game_input. An unknown name lists " +
        "the registered ones. Returns the command's result and the new state.",
      inputSchema: {
        name: z.string().describe("Command name."),
        args: z.array(z.unknown()).optional().describe("JSON arguments, passed in order."),
      },
    },
    safely(async ({ name, args }) => {
      const s = live();
      const result = await s.call("command", name, ...(args ?? []));
      return json({ result: result ?? null, state: await s.call("state") });
    }),
  );

  server.registerTool(
    "game_input",
    {
      title: "Send input",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description:
        "Keyboard, pointer, wheel or touch input. press/release take a KeyboardEvent.code (e.g. Space, ArrowLeft, KeyZ), or PointerRight / PointerMiddle for mouse buttons. " +
        "tap/pointer_down/pointer_move take logical x, y; tap and pointer_down also take kind (mouse, touch or pen). wheel takes dy (and dx) in CSS pixels. " +
        "touch_down/touch_move take id, x, y (touch_down also kind: touch or pen); touch_up takes id. Input takes effect on the next game_step.",
      inputSchema: {
        action: z.enum([
          "press",
          "release",
          "tap",
          "pointer_down",
          "pointer_move",
          "pointer_up",
          "wheel",
          "touch_down",
          "touch_move",
          "touch_up",
        ]),
        code: z.string().optional().describe("For press/release."),
        x: z.number().optional(),
        y: z.number().optional(),
        kind: z.enum(["mouse", "touch", "pen"]).optional().describe("Pointer kind for tap, pointer_down and touch_down."),
        dy: z.number().optional().describe("For wheel: vertical scroll, positive = down."),
        dx: z.number().optional().describe("For wheel: horizontal scroll."),
        id: z.number().int().optional().describe("Touch contact id for touch_down/touch_move/touch_up."),
      },
    },
    safely(async ({ action, code, x, y, kind, dy, dx, id }) => {
      const s = live();
      const kindArg = kind ? [kind] : [];
      if (action === "press" || action === "release") {
        if (!code) throw new Error(`${action} needs a key code`);
        await s.call(action, code);
      } else if (action === "pointer_up") {
        await s.call("pointerUp");
      } else if (action === "wheel") {
        if (dy === undefined && dx === undefined) throw new Error("wheel needs dy or dx");
        await s.call("wheel", dy ?? 0, dx ?? 0);
      } else if (action === "touch_up") {
        if (id === undefined) throw new Error("touch_up needs id");
        await s.call("touchUp", id);
      } else if (action === "touch_down" || action === "touch_move") {
        if (id === undefined || x === undefined || y === undefined) throw new Error(`${action} needs id, x and y`);
        if (action === "touch_down") {
          if (kind === "mouse") throw new Error("touch_down kind is touch or pen");
          await s.call("touchDown", id, x, y, ...kindArg);
        } else await s.call("touchMove", id, x, y);
      } else {
        if (x === undefined || y === undefined) throw new Error(`${action} needs x and y`);
        if (action === "pointer_move") await s.call("pointerMove", x, y);
        else await s.call(action === "tap" ? "tap" : "pointerDown", x, y, ...kindArg);
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
      annotations: { readOnlyHint: false, destructiveHint: false },
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
      description: "Screenshot of the current frame as a PNG image. With `path`, also saves it to that file in the project.",
      inputSchema: {
        path: z.string().optional().describe("Save the PNG here, relative to the project root (e.g. public/thumbnail.png). Overwrites."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    safely(async ({ path }) => {
      const dataUrl = await live().call<string>("capture");
      const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const content: Content[] = [{ type: "image", data, mimeType: "image/png" }];
      if (path) {
        const file = resolve(sessionRoot, path);
        const rel = relative(sessionRoot, file);
        if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`path must be a file inside the project root: ${path}`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, Buffer.from(data, "base64"));
        content.push({ type: "text", text: JSON.stringify({ saved: rel.split("\\").join("/") }) });
      }
      return { content };
    }),
  );

  server.registerTool(
    "game_pause",
    {
      title: "Pause or resume",
      annotations: { readOnlyHint: false, destructiveHint: false },
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
        "longTaskMs (browser-reported main-thread stalls). Use it to explain stutter; in headless mode times reflect stepping, not real play. " +
        "summary: true returns percentiles and the 3 slowest frames instead of every frame.",
      inputSchema: {
        count: z.number().int().min(1).max(240).optional().describe("Default 60."),
        summary: z
          .boolean()
          .optional()
          .describe("Count, p50/p95/max of updateMs, renderMs, quads and drawCalls, and the 3 slowest frames."),
      },
      annotations: { readOnlyHint: true },
    },
    safely(async ({ count, summary }) => {
      const frames = await live().call<FrameLike[]>("frames", count ?? 60);
      return json(summary ? summarizeFrames(frames) : frames);
    }),
  );

  server.registerTool(
    "game_profile",
    {
      title: "Frame profile",
      description:
        "Why the game stutters, from myaku: frame-time percentiles (p50/p95/p99), hitches per minute, and the worst hitches explained. " +
        "Each has a cause (script, gc, upload, compile, layout, throttled, hidden, unknown), a confidence, the script and function to look at when known, " +
        "and a hint. Spans show time in debuff's update and render. Prefer this over game_frames to explain stutter; measure in live mode, since headless " +
        "stepping doesn't reflect real play.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safely(async () => {
      const s = live();
      if (s.mode === "headless") {
        throw new Error(
          "Profiling needs live mode: a headless copy only advances through game_step, so it has no real frame timing to explain. " +
            "Use game_frames with summary: true for update/render cost here, or open the game under `debuff dev` and call game_start again.",
        );
      }
      return json(await s.call("profile"));
    }),
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
      annotations: { readOnlyHint: false, destructiveHint: false },
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
    "game_rewind",
    {
      title: "Rewind the live game",
      annotations: { readOnlyHint: false, destructiveHint: false },
      description:
        "Live mode only. Take the human's game back (or forward, within the known session) to `tick`: the page reloads, replays " +
        "the session's inputs to that tick and stays paused, so the state is exactly what it was then. Use a note's `tick` to look " +
        "at the moment the human flagged. The page needs a second to reload; then use game_state or game_capture.",
      inputSchema: { tick: z.number().int().min(0).describe("Tick to go to, e.g. a note's tick.") },
    },
    safely(async ({ tick }) => {
      await live().call("rewind", tick);
      return json({ rewinding: tick });
    }),
  );

  server.registerTool(
    "game_errors",
    {
      title: "Runtime errors",
      description:
        "Runtime errors since the game started, explained: kind (your-code, debuff-usage, debuff-bug, outside), where (source file:line, " +
        "source-mapped), a hint, the loop phase and tick, and a repeat count. A loop error stops the game; fix it, then game_pause false to resume. " +
        "For debuff-bug, tell the human and share reportUrl rather than working around it. Type errors aren't runtime errors: use typecheck.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safely(async () => json(await live().call("errors"))),
  );

  server.registerTool(
    "game_stop",
    {
      title: "Stop game",
      annotations: { readOnlyHint: false, destructiveHint: false },
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

type FrameLike = { updateMs: number; renderMs: number; quads: number; drawCalls: number };

/** Percentiles of the frame fields agents read, plus the 3 slowest frames (by update + render). */
export function summarizeFrames(frames: FrameLike[]) {
  const stats = (key: "updateMs" | "renderMs" | "quads" | "drawCalls") => {
    const sorted = frames.map((f) => f[key]).sort((a, b) => a - b);
    const at = (p: number) => Math.round((sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0) * 1000) / 1000;
    return { p50: at(0.5), p95: at(0.95), max: at(1) };
  };
  return {
    count: frames.length,
    updateMs: stats("updateMs"),
    renderMs: stats("renderMs"),
    quads: stats("quads"),
    drawCalls: stats("drawCalls"),
    worst: [...frames].sort((a, b) => b.updateMs + b.renderMs - (a.updateMs + a.renderMs)).slice(0, 3),
  };
}
