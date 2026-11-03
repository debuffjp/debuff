import type { DevHooks } from "./index.js";

// WebMCP (https://webmachinelearning.github.io/webmcp/, draft of 27 October 2026). Experimental: Chrome origin trial.
interface ToolContent {
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
  isError?: boolean;
}

interface WebMcpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean; debugging?: boolean };
  execute(input: Record<string, unknown>, options: { signal: AbortSignal }): Promise<ToolContent>;
}

interface ModelContext {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): Promise<void>;
}

/** `document.modelContext`, or the pre-2026 `navigator.modelContext` that Chrome still aliases. */
export function modelContext(): ModelContext | undefined {
  return (document as { modelContext?: ModelContext }).modelContext ?? (navigator as { modelContext?: ModelContext }).modelContext;
}

const json = (value: unknown): ToolContent => ({ content: [{ type: "text", text: JSON.stringify(value ?? null) }] });

const num = { type: "number" };

type DevTool = Omit<WebMcpTool, "execute" | "annotations"> & {
  run(input: Record<string, unknown>): Promise<ToolContent>;
  readOnly?: boolean;
  /** Returns text a player or tester typed, which an agent must not take as instructions. */
  untrusted?: boolean;
};

/** Same names and arguments as the `@debuffjp/mcp` tools, so agent skills and prompts carry over. */
export function tools(hooks: DevHooks): DevTool[] {
  return [
    {
      name: "game_state",
      title: "Game state",
      description:
        "Current scene, tick, time, logical width and height, renderer, frame stats, the scene's inspect() data and plugin inspect data.",
      readOnly: true,
      untrusted: true,
      run: async () => json(hooks.state()),
    },
    {
      name: "game_step",
      title: "Advance time",
      description: "Pause and advance the simulation by fixed steps (60 per second by default); returns the new state.",
      inputSchema: {
        type: "object",
        properties: {
          steps: { type: "integer", minimum: 1, maximum: 36_000, description: "Fixed simulation steps to run." },
          quiet: { type: "boolean", description: "Leave out the scene's inspect() state and plugin data." },
        },
        required: ["steps"],
      },
      run: async ({ steps, quiet }) => {
        const { state, plugins, ...rest } = hooks.step(Number(steps));
        return json(quiet ? rest : { ...rest, state, plugins });
      },
    },
    {
      name: "game_pause",
      title: "Pause or resume",
      description: "Pause or resume the game. game_step also pauses first.",
      inputSchema: { type: "object", properties: { paused: { type: "boolean" } }, required: ["paused"] },
      run: async ({ paused }) => json(paused ? hooks.pause() : hooks.resume()),
    },
    {
      name: "game_input",
      title: "Send input",
      description:
        "press/release take a KeyboardEvent.code (Space, ArrowLeft, KeyZ). tap/pointer_down/pointer_move take logical x, y. " +
        "wheel takes dy (and dx). Input takes effect on the next game_step.",
      inputSchema: {
        type: "object",
        properties: {
          action: { enum: ["press", "release", "tap", "pointer_down", "pointer_move", "pointer_up", "wheel"] },
          code: { type: "string" },
          x: num,
          y: num,
          dy: num,
          dx: num,
        },
        required: ["action"],
      },
      run: async ({ action, code, x, y, dy, dx }) => {
        if (action === "press" || action === "release") {
          if (typeof code !== "string") throw new Error(`${action} needs a key code`);
          hooks[action](code);
        } else if (action === "pointer_up") hooks.pointerUp();
        else if (action === "wheel") hooks.wheel(Number(dy ?? 0), Number(dx ?? 0));
        else {
          if (typeof x !== "number" || typeof y !== "number") throw new Error(`${action} needs x and y`);
          if (action === "tap") hooks.tap(x, y);
          else if (action === "pointer_down") hooks.pointerDown(x, y);
          else hooks.pointerMove(x, y);
        }
        return json({ ok: true });
      },
    },
    {
      name: "game_command",
      title: "Run a game command",
      description:
        "Run a command the game registered with devTools({ commands }); recorded in replays. Returns its result and the new state.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" }, args: { type: "array" } },
        required: ["name"],
      },
      run: async ({ name, args }) =>
        json({ result: hooks.command(String(name), ...((args as unknown[]) ?? [])) ?? null, state: hooks.state() }),
    },
    {
      name: "game_params",
      title: "List params",
      description: "Every tunable param group: schema (type, default, min, max, units, description) and current values.",
      readOnly: true,
      run: async () => json(hooks.params()),
    },
    {
      name: "game_set_param",
      title: "Set param",
      description: "Set a tunable param live, validated against its type and range. Lasts until a reload.",
      inputSchema: {
        type: "object",
        properties: { group: { type: "string" }, key: { type: "string" }, value: { type: ["number", "boolean"] } },
        required: ["group", "key", "value"],
      },
      run: async ({ group, key, value }) => {
        hooks.setParam(String(group), String(key), value as number | boolean);
        return json({ ok: true, group, key, value });
      },
    },
    {
      name: "game_capture",
      title: "Capture frame",
      description: "Screenshot of the current frame as a PNG image.",
      readOnly: true,
      run: async () => {
        const url = hooks.capture();
        return { content: [{ type: "image", data: url.slice(url.indexOf(",") + 1), mimeType: "image/png" }] };
      },
    },
    {
      name: "game_errors",
      title: "Runtime errors",
      description: "Runtime errors since load, each with a plain-language explanation and a likely fix.",
      readOnly: true,
      run: async () => json(hooks.errors()),
    },
    {
      name: "game_notes",
      title: "Flagged moments",
      description: "Moments the human flagged in the dev overlay, with their tick and comment. Read these first.",
      readOnly: true,
      untrusted: true,
      run: async () => json(hooks.notes()),
    },
  ];
}

/**
 * Registers the dev hooks as WebMCP tools when the browser supports it, so an in-browser agent can play
 * and inspect the game with no MCP server. Returns a function that unregisters them.
 */
export function registerWebMcp(hooks: DevHooks): (() => void) | undefined {
  const context = modelContext();
  if (!context) return undefined;
  const controller = new AbortController();
  for (const { run, readOnly, untrusted, ...tool } of tools(hooks)) {
    context
      .registerTool(
        {
          ...tool,
          annotations: { readOnlyHint: !!readOnly, untrustedContentHint: !!untrusted, debugging: true },
          // Agents see a thrown error only as "failed" with no message (agent-browser 0.41), so return it.
          execute: (input) =>
            run(input ?? {}).catch((error: unknown) => ({
              isError: true,
              content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
            })),
        },
        { signal: controller.signal },
      )
      .catch((error: unknown) => console.warn(`[debuff] WebMCP: could not register ${tool.name}`, error));
  }
  return () => controller.abort();
}
