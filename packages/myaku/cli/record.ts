/**
 * `myaku record`: play a game in a real browser with myaku injected, and return its report. Node only;
 * nothing in myaku's browser entry points imports this.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Report } from "myaku";
import type { Browser, Page } from "playwright-core";

export interface RecordOptions {
  /** A URL to open, or a folder to serve (a production build such as `dist/`). */
  target: string;
  /** Seconds to record after the page has loaded (default 10). */
  seconds?: number | undefined;
  /** Seconds to wait after load before recording, so start-up isn't counted (default 1). */
  warmup?: number | undefined;
  /** CPU slowdown factor, e.g. 4 for a mid-range phone (Chromium only). */
  cpuThrottle?: number | undefined;
  /** Viewport size (default 1280×720). */
  viewport?: { width: number; height: number };
  /** Show the browser window. */
  headed?: boolean;
  /** Drives the game while recording: an `async (page) => {}`, e.g. pressing keys. */
  play?: (page: Page) => Promise<void>;
}

export interface Budget {
  name: string;
  limit: number;
  actual: number;
  ok: boolean;
}

/** The folder holding myaku's browser modules (served to the page under /__myaku__/). */
const browserDir = () => fileURLToPath(new URL("../dist/", import.meta.url));
const PREFIX = "/__myaku__/";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};

/** Serve a folder on a free port. */
async function serve(dir: string): Promise<{ url: string; server: Server }> {
  const root = resolve(dir);
  if (!existsSync(join(root, "index.html"))) throw new Error(`No index.html in ${root}. Build the game first, or pass a URL.`);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}/`, server };
}

/** Put myaku first in the page, so it sees the canvas context and the game loop from the start. */
export function inject(html: string, size: number): string {
  const tag = `<script type="module">import { myaku } from "${PREFIX}index.js"; myaku({ size: ${size} });</script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : tag + html;
}

/** Chrome, Edge or Chromium through playwright-core (or the browser at MYAKU_BROWSER). */
async function launch(headed: boolean): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.MYAKU_BROWSER;
  if (executablePath) return chromium.launch({ executablePath, headless: !headed });
  for (const channel of ["chrome", "msedge", "chromium"]) {
    try {
      return await chromium.launch({ channel, headless: !headed });
    } catch {
      // Not installed; try the next one.
    }
  }
  throw new Error("No Chromium-based browser found. Install Chrome or Edge, or set MYAKU_BROWSER to a browser executable.");
}

export async function record(options: RecordOptions): Promise<Report> {
  const seconds = options.seconds ?? 10;
  const warmup = options.warmup ?? 1;
  // Enough frames for the whole recording at up to 240 Hz.
  const size = Math.min(60_000, Math.ceil((seconds + warmup) * 240));
  const isUrl = /^https?:\/\//.test(options.target);
  const served = isUrl ? undefined : await serve(options.target);
  const url = served?.url ?? options.target;
  const browser = await launch(options.headed ?? false);
  try {
    const page = await browser.newPage({ viewport: options.viewport ?? { width: 1280, height: 720 } });
    await page.route("**/*", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.startsWith(PREFIX)) {
        const dir = normalize(browserDir());
        const file = normalize(join(dir, path.slice(PREFIX.length)));
        if (!file.startsWith(dir) || !existsSync(file)) return route.fulfill({ status: 404 });
        return route.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(file, "utf8") });
      }
      if (request.resourceType() === "document" && request.frame() === page.mainFrame()) {
        try {
          const response = await route.fetch();
          return await route.fulfill({ response, body: inject(await response.text(), size) });
        } catch {
          return route.abort("connectionrefused");
        }
      }
      return route.continue();
    });
    if (options.cpuThrottle && options.cpuThrottle > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: options.cpuThrottle });
    }
    await page.goto(url, { waitUntil: "load" }).catch(() => {
      throw new Error(`Couldn't load ${url}. Is the server running?`);
    });
    await page
      .waitForFunction(() => (window as unknown as { __MYAKU__?: unknown }).__MYAKU__ !== undefined, undefined, { timeout: 10_000 })
      .catch(() => {
        throw new Error("myaku didn't start in the page. Is it a normal HTML page with scripts?");
      });
    await page.waitForTimeout(warmup * 1000);
    // Start the report from here: drop warm-up frames by restarting the profiler's buffer.
    await page.evaluate(() => (window as unknown as { __MYAKU__: { reset(): void } }).__MYAKU__.reset());
    const playing = options.play?.(page);
    await page.waitForTimeout(seconds * 1000);
    await playing;
    return (await page.evaluate(() => (window as unknown as { __MYAKU__: { report(): unknown } }).__MYAKU__.report())) as Report;
  } finally {
    await browser.close();
    served?.server.close();
  }
}

/** Compare a report with limits. Missing limits are skipped. */
export function checkBudgets(
  report: Report,
  limits: { p95?: number | undefined; p99?: number | undefined; hitchesPerMinute?: number | undefined },
): Budget[] {
  const out: Budget[] = [];
  const add = (name: string, limit: number | undefined, actual: number) => {
    if (limit !== undefined) out.push({ name, limit, actual, ok: actual <= limit });
  };
  add("p95 frame time (ms)", limits.p95, report.intervalMs.p95);
  add("p99 frame time (ms)", limits.p99, report.intervalMs.p99);
  add("hitches per minute", limits.hitchesPerMinute, report.hitchesPerMinute);
  return out;
}
