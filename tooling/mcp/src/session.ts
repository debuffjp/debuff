import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_PATHS,
  type AgentStatus,
  callHook,
  createDevServer,
  DEV_SERVER_FILE,
  type DevServerInfo,
  hooksReady,
  launchBrowser,
} from "@debuffjp/cli";
import type { Browser, Page } from "playwright-core";
import type { ViteDevServer } from "vite";

/** A running game an agent can drive through the dev hooks. */
export interface GameSession {
  /**
   * "live": the game the human has open under `debuff dev`, running in real time; the agent's actions
   * show in their overlay. "headless": a private paused copy where time only advances via step.
   */
  readonly mode: "live" | "headless";
  readonly url: string;
  call<R = unknown>(method: string, ...args: unknown[]): Promise<R>;
  stop(): Promise<void>;
}

export type StartMode = "auto" | "live" | "headless";

/** Live if `debuff dev` is running with a page open (or `mode` says so), else headless. */
export async function startSession(
  root: string,
  options: { mode?: StartMode; page?: string; width?: number; height?: number } = {},
): Promise<GameSession> {
  const mode = options.mode ?? "auto";
  if (mode !== "headless") {
    const live = await LiveSession.find(root);
    if (live) return live;
    if (mode === "live") {
      throw new Error("No live game found. Run `debuff dev` and open the game in a browser, or use mode headless.");
    }
  }
  return HeadlessSession.start(root, options);
}

/** The developer's own browser tab, reached through the dev server's agent link. */
export class LiveSession implements GameSession {
  readonly mode = "live";
  private constructor(
    readonly url: string,
    private readonly attachment: AbortController,
  ) {}

  static async find(root: string): Promise<LiveSession | undefined> {
    let info: DevServerInfo;
    try {
      info = JSON.parse(readFileSync(join(root, DEV_SERVER_FILE), "utf8")) as DevServerInfo;
    } catch {
      return undefined;
    }
    try {
      const res = await fetch(new URL(AGENT_PATHS.status, info.url), { signal: AbortSignal.timeout(1500) });
      const status = (await res.json()) as AgentStatus;
      if (status.pages === 0) return undefined;
      // Hold an attach connection while this session lives, so the overlay shows the agent until it stops
      // (or the agent process exits), not just right after an action.
      const attachment = new AbortController();
      const held = await fetch(new URL(AGENT_PATHS.attach, info.url), { signal: attachment.signal });
      void held.body?.pipeTo(new WritableStream()).catch(() => undefined);
      return new LiveSession(info.url, attachment);
    } catch {
      return undefined; // stale file: the dev server is gone
    }
  }

  async call<R = unknown>(method: string, ...args: unknown[]): Promise<R> {
    const res = await fetch(new URL(AGENT_PATHS.rpc, this.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, args }),
    });
    const body = (await res.json()) as { ok: true; result: R } | { ok: false; error: string };
    if (!body.ok) throw new Error(outdated(body.error));
    return body.result;
  }

  async stop(): Promise<void> {
    // The human's tab: leave it running, just let go of any pause the agent made.
    await this.call("resume").catch(() => undefined);
    this.attachment.abort();
  }
}

/**
 * A private game: the project's dev server plus a headless browser page in controlled mode
 * (`?debuff-scenario`), so time only advances when an agent steps it.
 */
export class HeadlessSession implements GameSession {
  readonly mode = "headless";
  private constructor(
    readonly url: string,
    private readonly server: ViteDevServer,
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  static async start(root: string, options: { page?: string; width?: number; height?: number } = {}): Promise<HeadlessSession> {
    const server = await createDevServer(root, { port: 0, logLevel: "error" });
    await server.listen();
    const base = server.resolvedUrls?.local[0];
    if (!base) {
      await server.close();
      throw new Error("Dev server did not report a URL");
    }
    let browser: Browser | undefined;
    try {
      browser = await launchBrowser();
      const page = await browser.newPage({
        viewport: { width: options.width ?? 960, height: options.height ?? 540 },
        deviceScaleFactor: 1,
      });
      const url = new URL(options.page ?? "/", base);
      url.searchParams.set("debuff-scenario", "1");
      await page.goto(url.toString());
      await page.waitForFunction(hooksReady, undefined, { timeout: 15_000 });
      return new HeadlessSession(url.toString(), server, browser, page);
    } catch (err) {
      await browser?.close();
      await server.close();
      throw err;
    }
  }

  /** Call a `window.__DEBUFF_DEV__` method. */
  async call<R = unknown>(method: string, ...args: unknown[]): Promise<R> {
    try {
      return (await this.page.evaluate(callHook, [method, args] as [string, unknown[]])) as R;
    } catch (err) {
      // Playwright wraps page errors as "page.evaluate: Error: <message>\n    at …"; agents only need the message.
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(message.replace(/^page\.evaluate: (?:\w*Error: )?/, "").split("\n    at ")[0]);
    }
  }

  async stop(): Promise<void> {
    await this.browser.close();
    await this.server.close();
  }
}

/** Pages running an older @debuffjp/dev answer new methods with a bare "Unknown dev hook"; say what to do. */
function outdated(error: string): string {
  return /^Unknown dev hook "[^"]*"$/.test(error)
    ? `${error}: the game's @debuffjp/dev is older than this tool. Update it (npm i -D @debuffjp/dev@latest).`
    : error;
}
