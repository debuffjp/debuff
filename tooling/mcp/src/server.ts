import { resolve } from "node:path";
import { buildReport, compileAssets, findUnused, inspectProject, loadConfig, runScenarios, viteConfig } from "@debuff/cli";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GameSession } from "./session.js";

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
        "Tools for building 2D web games with debuff. Start with inspect_project. To see the game, call game_start, then game_state / game_capture; " +
        "time only advances through game_step, so results are deterministic. Prefer tuning params (game_params, game_set_param) over code changes, " +
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

  // ---- live game tools -----------------------------------------------------------------------

  server.registerTool(
    "game_start",
    {
      title: "Start game",
      description: "Start the dev server and open the game in a headless browser, paused. Replaces any running game.",
      inputSchema: { ...root, page: z.string().optional().describe('Path to open. Default "/".') },
    },
    safely(async ({ root: r, page }) => {
      await session?.stop();
      session = undefined;
      session = await GameSession.start(rootOf(r), page ? { page } : {});
      return json({ url: session.url, state: await session.call("state") });
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
    "game_errors",
    {
      title: "Runtime errors",
      description: "Uncaught errors and unhandled rejections since the game started.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safely(async () => json(await live().call("errors"))),
  );

  server.registerTool(
    "game_stop",
    { title: "Stop game", description: "Close the browser and dev server.", inputSchema: {} },
    safely(async () => {
      await session?.stop();
      session = undefined;
      return json({ ok: true });
    }),
  );

  const close = server.close.bind(server);
  server.close = async () => {
    await session?.stop();
    session = undefined;
    await close();
  };
  return server;
}
