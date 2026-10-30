import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { ViteDevServer } from "vite";

/** Endpoints shared with `@debuffjp/dev` (page side) and `@debuffjp/mcp` (agent side). */
export const AGENT_PATHS = {
  events: "/__debuff/agent/events",
  attach: "/__debuff/agent/attach",
  result: "/__debuff/agent/result",
  rpc: "/__debuff/agent/rpc",
  status: "/__debuff/agent/status",
} as const;

/** The dev panel's "save as scenario" posts `{ name, scenario }` here (see `@debuffjp/dev`). */
export const SCENARIO_PATH = "/__debuff/scenario";

/**
 * Write a scenario from the dev panel to `scenarios/<name>.json`, never overwriting: a taken name gets a
 * numeric suffix. Returns the path relative to the project root.
 */
export function saveScenario(root: string, name: string, scenario: unknown): string {
  if (!/^[\w-]{1,80}$/.test(name)) throw new Error("Scenario names may use letters, digits, - and _ (max 80)");
  if (typeof scenario !== "object" || scenario === null || !Array.isArray((scenario as { steps?: unknown }).steps))
    throw new Error("Expected a scenario with a steps array");
  const dir = join(root, "scenarios");
  mkdirSync(dir, { recursive: true });
  let file = `${name}.json`;
  for (let n = 2; existsSync(join(dir, file)); n++) file = `${name}-${n}.json`;
  writeFileSync(join(dir, file), `${JSON.stringify(scenario, null, 2)}\n`);
  return `scenarios/${file}`;
}

/** The dev panel's clip button and the `saveClip` hook post `{ name, extension, data }` (base64) here. */
export const CAPTURE_PATH = "/__debuff/capture";

/** Where captures from the dev panel and agents go: inside `.debuff/`, which new projects keep out of git. */
export const CAPTURES_DIR = ".debuff/captures";

const CAPTURE_TYPES = new Set(["mp4", "webm", "png"]);
/** A 15 s clip at 4 Mbps is about 8 MB; this leaves room for higher bitrates. */
const CAPTURE_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Write a clip or still from the dev panel to `.debuff/captures/<name>.<extension>`, never overwriting: a
 * taken name gets a numeric suffix. Returns the path relative to the project root.
 */
export function saveCapture(root: string, name: string, extension: string, data: string): string {
  if (!/^[\w-]{1,80}$/.test(name)) throw new Error("Capture names may use letters, digits, - and _ (max 80)");
  if (!CAPTURE_TYPES.has(extension)) throw new Error(`Captures are ${[...CAPTURE_TYPES].join(", ")}; got "${extension}"`);
  if (typeof data !== "string" || !data) throw new Error("Expected base64 data");
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > CAPTURE_MAX_BYTES) throw new Error(`Capture is over ${CAPTURE_MAX_BYTES / 1024 / 1024} MB`);
  const dir = join(root, CAPTURES_DIR);
  mkdirSync(dir, { recursive: true });
  let file = `${name}.${extension}`;
  for (let n = 2; existsSync(join(dir, file)); n++) file = `${name}-${n}.${extension}`;
  writeFileSync(join(dir, file), bytes);
  return `${CAPTURES_DIR}/${file}`;
}

/** Written while `debuff dev` runs, so tools can find the live game. */
export const DEV_SERVER_FILE = ".debuff/dev-server.json";

export interface DevServerInfo {
  url: string;
  pid: number;
}

export interface AgentStatus {
  /** Open game pages listening for agent commands. */
  pages: number;
  /** Agents currently attached (holding an attach connection). */
  agents: number;
}

interface Pending {
  resolve: (body: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Agent link (server side): relays dev-hook calls from tools to the game open in the developer's
 * browser. Pages subscribe over Server-Sent Events; a tool POSTs `{ method, args }` to the RPC endpoint,
 * the newest page runs it and POSTs the result back. Dev server only, localhost only.
 */
export function attachAgentLink(server: ViteDevServer, root: string): void {
  const pages: ServerResponse[] = [];
  const pending = new Map<string, Pending>();
  let agents = 0;
  const announce = () => {
    for (const page of pages) send(page, "presence", { agents });
  };
  let nextId = 1;

  const send = (res: ServerResponse, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  server.middlewares.use(async (req, res, next) => {
    const url = req.url?.split("?")[0];
    if (url === SCENARIO_PATH || url === CAPTURE_PATH || url?.startsWith("/__debuff/agent/")) {
      const refusal = refuseForeign(req);
      if (refusal) return reply(res, refusal.status, { ok: false, error: refusal.error });
    }
    if (url === SCENARIO_PATH && req.method === "POST") {
      try {
        const { name, scenario } = (await readJson(req)) as { name: string; scenario: unknown };
        return reply(res, 200, { file: saveScenario(root, name, scenario) });
      } catch (err) {
        return reply(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (url === CAPTURE_PATH && req.method === "POST") {
      try {
        const { name, extension, data } = (await readJson(req)) as { name: string; extension: string; data: string };
        return reply(res, 200, { file: saveCapture(root, name, extension, data) });
      } catch (err) {
        return reply(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (!url?.startsWith("/__debuff/agent/")) return next();
    try {
      if (url === AGENT_PATHS.events && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": debuff agent link\n\n");
        pages.push(res);
        send(res, "presence", { agents });
        const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
        req.on("close", () => {
          clearInterval(keepAlive);
          pages.splice(pages.indexOf(res), 1);
        });
        return;
      }
      if (url === AGENT_PATHS.status && req.method === "GET") return reply(res, 200, { pages: pages.length, agents } satisfies AgentStatus);
      if (url === AGENT_PATHS.attach && req.method === "GET") {
        // Held open by an agent for as long as it is attached; closing it (or the agent dying) detaches.
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": attached\n\n");
        agents++;
        announce();
        const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
        req.on("close", () => {
          clearInterval(keepAlive);
          agents--;
          announce();
        });
        return;
      }
      if (url === AGENT_PATHS.result && req.method === "POST") {
        const body = (await readJson(req)) as { id: string };
        const p = pending.get(body.id);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(body.id);
          p.resolve(body);
        }
        return reply(res, 204);
      }
      if (url === AGENT_PATHS.rpc && req.method === "POST") {
        const { method, args = [] } = (await readJson(req)) as { method: string; args?: unknown[] };
        const page = pages.at(-1);
        if (!page) return reply(res, 503, { ok: false, error: "No game page is open. Open the dev server URL in a browser." });
        const id = String(nextId++);
        const result = await new Promise<unknown>((resolve) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            resolve({ id, ok: false, error: `The game page did not answer "${method}" within 10 s (is the tab in the background?)` });
          }, 10_000);
          pending.set(id, { resolve, timer });
          send(page, "command", { id, method, args });
        });
        return reply(res, 200, result);
      }
      reply(res, 404, { ok: false, error: `Unknown agent endpoint ${url}` });
    } catch (err) {
      reply(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  const file = join(root, DEV_SERVER_FILE);
  server.httpServer?.once("listening", () => {
    const url = server.resolvedUrls?.local[0];
    if (!url) return;
    mkdirSync(join(root, ".debuff"), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ url, pid: process.pid } satisfies DevServerInfo, null, 2)}\n`);
  });
  server.httpServer?.once("close", () => {
    for (const p of pending.values()) clearTimeout(p.timer);
    for (const page of pages) page.end();
    rmSync(file, { force: true });
  });
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * CSRF guard for the dev server's `/__debuff/` endpoints. Any website the developer visits could
 * otherwise POST here (write scenarios, drive the game) or subscribe to the event streams. Browsers
 * always send `Origin` on cross-origin requests, so one that is present must be the dev server's own
 * (loopback names are interchangeable when the port matches). Node clients send no Origin and pass.
 * POSTs must be `application/json`, which a cross-site form or no-cors fetch cannot send without a
 * preflight that we never answer.
 */
export function refuseForeign(req: Pick<IncomingMessage, "headers" | "method">): { status: number; error: string } | undefined {
  const origin = req.headers.origin;
  if (origin !== undefined && !isOwnOrigin(origin, req.headers.host)) {
    return { status: 403, error: `[debuff] Refused a request from ${origin}: the dev server only accepts its own origin.` };
  }
  if (req.method === "POST") {
    const type = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (type !== "application/json") return { status: 415, error: "[debuff] Expected Content-Type: application/json." };
  }
  return undefined;
}

function isOwnOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  let o: URL;
  let h: URL;
  try {
    o = new URL(origin);
    h = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (o.protocol !== "http:" && o.protocol !== "https:") return false;
  const port = (u: URL) => u.port || (u.protocol === "https:" ? "443" : "80");
  const hostPort = h.port || port(o);
  if (port(o) !== hostPort) return false;
  if (o.hostname === h.hostname) return true;
  return LOOPBACK.has(o.hostname) && LOOPBACK.has(h.hostname);
}

function reply(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  if (body === undefined) return void res.end();
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || "{}");
}
