import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/** A scenario is plain JSON so humans, agents and tools can all write it.
 *  Time only advances through `wait` steps, so runs are deterministic. */
export interface Scenario {
  name?: string;
  /** Path to open on the dev server. Default "/". */
  page?: string;
  steps: Step[];
}

export type Comparison = { eq?: unknown; gt?: number; gte?: number; lt?: number; lte?: number; approx?: [number, number] };

export type Step =
  | { wait: number }
  | { press: string }
  | { release: string }
  | { tap: [number, number] }
  | { pointerDown: [number, number] }
  | { pointerUp: true }
  /** `{ "player.speed": 300 }` → group "player", key "speed". */
  | { set: Record<string, number | boolean> }
  /** Paths into the dev state, e.g. "scene", "tick", "state.score". */
  | { expect: Record<string, Comparison> }
  | { capture: string; tolerance?: number };

export interface StepResult {
  index: number;
  step: Step;
  ok: boolean;
  message?: string;
}

export interface ScenarioReport {
  name: string;
  ok: boolean;
  steps: StepResult[];
  errors: string[];
  captures: { name: string; path: string; baseline: string; status: "new" | "match" | "diff" | "updated"; diffRatio?: number }[];
  finalState: unknown;
  durationMs: number;
}

export interface RunOptions {
  root: string;
  files: string[];
  update: boolean;
}

interface PageLike {
  goto(url: string): Promise<unknown>;
  waitForFunction(fn: string, arg?: unknown, opts?: { timeout: number }): Promise<unknown>;
  evaluate<R>(fn: (arg: never) => unknown, arg?: unknown): Promise<R>;
}

export function findScenarios(root: string, files: string[]): string[] {
  if (files.length) return files.map((f) => join(root, f));
  const dir = join(root, "scenarios");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(dir, f));
}

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function compare(actual: unknown, c: Comparison): string | undefined {
  const n = actual as number;
  if ("eq" in c && JSON.stringify(actual) !== JSON.stringify(c.eq))
    return `expected ${JSON.stringify(c.eq)}, got ${JSON.stringify(actual)}`;
  if (c.gt !== undefined && !(n > c.gt)) return `expected > ${c.gt}, got ${actual}`;
  if (c.gte !== undefined && !(n >= c.gte)) return `expected >= ${c.gte}, got ${actual}`;
  if (c.lt !== undefined && !(n < c.lt)) return `expected < ${c.lt}, got ${actual}`;
  if (c.lte !== undefined && !(n <= c.lte)) return `expected <= ${c.lte}, got ${actual}`;
  if (c.approx && !(Math.abs(n - c.approx[0]) <= c.approx[1])) return `expected ${c.approx[0]} ± ${c.approx[1]}, got ${actual}`;
  return undefined;
}

async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.DEBUFF_BROWSER;
  if (executablePath) return chromium.launch({ executablePath });
  for (const channel of ["msedge", "chrome", "chromium"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // try next
    }
  }
  throw new Error("No Chromium-based browser found. Install Chrome or Edge, or set DEBUFF_BROWSER to an executable path.");
}

/** Pixel diff in the browser: avoids a PNG decoder dependency in Node. */
const DIFF = `async ([a, b]) => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return 1;
  const read = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
  const da = read(ia), db = read(ib);
  let bad = 0;
  for (let i = 0; i < da.length; i += 4) {
    if (Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) > 48) bad++;
  }
  return bad / (da.length / 4);
}`;

export async function runScenarios(options: RunOptions): Promise<ScenarioReport[]> {
  const files = findScenarios(options.root, options.files);
  if (!files.length) throw new Error(`No scenarios found. Add JSON files to ${join(options.root, "scenarios")}.`);
  const { createServer } = await import("vite");
  const { debuff } = await import("./vite-plugin.js");
  const hasConfig = ["vite.config.ts", "vite.config.js", "vite.config.mjs"].some((f) => existsSync(join(options.root, f)));
  const server = await createServer({
    root: options.root,
    ...(hasConfig ? {} : { configFile: false as const }),
    plugins: [debuff()],
    logLevel: "error",
    server: { port: 0, strictPort: false },
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0] ?? "http://localhost:5173/";
  const browser = await launchBrowser();
  const reports: ScenarioReport[] = [];
  try {
    for (const file of files) {
      const scenario = JSON.parse(readFileSync(file, "utf8")) as Scenario;
      const name = scenario.name ?? basename(file, ".json");
      const page = (await browser.newPage({ viewport: { width: 960, height: 540 } })) as unknown as PageLike & { close(): Promise<void> };
      try {
        reports.push(await runOne(page, base, name, scenario, options));
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  const outDir = join(options.root, ".debuff", "reports");
  mkdirSync(outDir, { recursive: true });
  for (const r of reports) writeFileSync(join(outDir, `scenario-${r.name}.json`), `${JSON.stringify(r, null, 2)}\n`);
  return reports;
}

async function runOne(page: PageLike, base: string, name: string, scenario: Scenario, options: RunOptions): Promise<ScenarioReport> {
  const started = Date.now();
  const url = new URL(scenario.page ?? "/", base);
  url.searchParams.set("debuff-scenario", "1");
  await page.goto(url.toString());
  await page.waitForFunction("window.__DEBUFF_DEV__?.controlled === true", undefined, { timeout: 15000 });

  // Functions are serialised into the page, so build the call there from a source string.
  const dev = <R>(expr: string, arg?: unknown) =>
    page.evaluate<R>(
      ([e, a]: [string, unknown]) =>
        new Function("d", "arg", `return ${e}`)((globalThis as unknown as { __DEBUFF_DEV__: unknown }).__DEBUFF_DEV__, a),
      [expr, arg] as never,
    );
  const results: StepResult[] = [];
  const captures: ScenarioReport["captures"] = [];

  for (const [index, step] of scenario.steps.entries()) {
    let message: string | undefined;
    try {
      if ("wait" in step) await dev("d.step(arg)", step.wait);
      else if ("press" in step) await dev("d.press(arg)", step.press);
      else if ("release" in step) await dev("d.release(arg)", step.release);
      else if ("tap" in step) await dev("d.tap(arg[0], arg[1])", step.tap);
      else if ("pointerDown" in step) await dev("d.pointerDown(arg[0], arg[1])", step.pointerDown);
      else if ("pointerUp" in step) await dev("d.pointerUp()");
      else if ("set" in step) {
        for (const [path, value] of Object.entries(step.set)) {
          const dot = path.indexOf(".");
          await dev("d.setParam(arg[0], arg[1], arg[2])", [path.slice(0, dot), path.slice(dot + 1), value]);
        }
      } else if ("expect" in step) {
        const state = await dev<unknown>("d.state()");
        const failures = Object.entries(step.expect)
          .map(([path, c]) => {
            const m = compare(get(state, path), c);
            return m && `${path}: ${m}`;
          })
          .filter(Boolean);
        if (failures.length) message = failures.join("; ");
      } else if ("capture" in step) {
        const dataUrl = await dev<string>("d.capture()");
        const dir = join(options.root, ".debuff", "captures", name);
        const baselineDir = join(options.root, "scenarios", "__baselines__", name);
        mkdirSync(dir, { recursive: true });
        mkdirSync(baselineDir, { recursive: true });
        const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
        const path = join(dir, `${step.capture}.png`);
        const baseline = join(baselineDir, `${step.capture}.png`);
        writeFileSync(path, png);
        const existed = existsSync(baseline);
        if (!existed || options.update) {
          writeFileSync(baseline, png);
          captures.push({ name: step.capture, path, baseline, status: existed ? "updated" : "new" });
        } else {
          const baseUrl = `data:image/png;base64,${readFileSync(baseline).toString("base64")}`;
          const diffRatio = await page.evaluate<number>(([src, args]: [string, unknown]) => new Function(`return (${src})`)()(args), [
            DIFF,
            [dataUrl, baseUrl],
          ] as never);
          const tolerance = step.tolerance ?? 0.002;
          const ok = diffRatio <= tolerance;
          captures.push({ name: step.capture, path, baseline, status: ok ? "match" : "diff", diffRatio });
          if (!ok)
            message = `capture "${step.capture}" differs from baseline: ${(diffRatio * 100).toFixed(2)}% pixels (tolerance ${(tolerance * 100).toFixed(2)}%)`;
        }
      } else {
        message = `Unknown step: ${JSON.stringify(step)}`;
      }
    } catch (err) {
      message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    }
    results.push({ index, step, ok: !message, ...(message ? { message } : {}) });
  }

  const errors = await dev<string[]>("d.errors()");
  const finalState = await dev<unknown>("d.state()");
  return {
    name,
    ok: results.every((r) => r.ok) && errors.length === 0,
    steps: results,
    errors,
    captures,
    finalState,
    durationMs: Date.now() - started,
  };
}

export function formatScenario(r: ScenarioReport): string {
  const lines = [`${r.ok ? "PASS" : "FAIL"} ${r.name} (${r.durationMs} ms)`];
  for (const s of r.steps) if (!s.ok) lines.push(`  step ${s.index} ${JSON.stringify(s.step)}: ${s.message}`);
  for (const e of r.errors) lines.push(`  runtime error: ${e.split("\n")[0]}`);
  for (const c of r.captures)
    lines.push(`  capture ${c.name}: ${c.status}${c.diffRatio !== undefined ? ` (${(c.diffRatio * 100).toFixed(3)}%)` : ""}`);
  return lines.join("\n");
}
