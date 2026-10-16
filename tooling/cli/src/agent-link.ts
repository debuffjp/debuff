import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { ViteDevServer } from "vite";

/** Endpoints shared with `@debuff/dev` (page side) and `@debuff/mcp` (agent side). */
export const AGENT_PATHS = {
  events: "/__debuff/agent/events",
  result: "/__debuff/agent/result",
  rpc: "/__debuff/agent/rpc",
  status: "/__debuff/agent/status",
} as const;

/** Written while `debuff dev` runs, so tools can find the live game. */
export const DEV_SERVER_FILE = ".debuff/dev-server.json";

export interface DevServerInfo {
  url: string;
  pid: number;
}

export interface AgentStatus {
  /** Open game pages listening for agent commands. */
  pages: number;
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
  let nextId = 1;

  const send = (res: ServerResponse, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  server.middlewares.use(async (req, res, next) => {
    const url = req.url?.split("?")[0];
    if (!url?.startsWith("/__debuff/agent/")) return next();
    try {
      if (url === AGENT_PATHS.events && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": debuff agent link\n\n");
        pages.push(res);
        const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
        req.on("close", () => {
          clearInterval(keepAlive);
          pages.splice(pages.indexOf(res), 1);
        });
        return;
      }
      if (url === AGENT_PATHS.status && req.method === "GET") return reply(res, 200, { pages: pages.length } satisfies AgentStatus);
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
