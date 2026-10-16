import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { amber, lime, paint } from "create-debuff";
import pc from "picocolors";
import type { Browser, Page } from "playwright-core";
import type { StepDef } from "../plugin.js";
import { createDevServer } from "../vite.js";
import { callHook, diffImages, hooksReady } from "./browser.js";
import type { CaptureResult, Comparison, RunOptions, Scenario, ScenarioReport, Step, StepResult } from "./types.js";

/** Pixels whose summed RGB delta exceeds this count as different (absorbs anti-aliasing noise). */
const PIXEL_THRESHOLD = 48;
const DEFAULT_TOLERANCE = 0.002;
const VIEWPORT = { width: 960, height: 540 };

export function findScenarios(root: string, files: string[]): string[] {
  if (files.length) return files.map((f) => join(root, f));
  const dir = join(root, "scenarios");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(dir, f));
}

/** Read a dotted path, e.g. "state.player.x". */
export function pick(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Returns a failure message, or undefined if every condition holds. */
export function compare(actual: unknown, c: Comparison): string | undefined {
  const show = (v: unknown) => JSON.stringify(v) ?? String(v);
  if ("eq" in c && show(actual) !== show(c.eq)) return `expected ${show(c.eq)}, got ${show(actual)}`;
  const numeric = c.gt !== undefined || c.gte !== undefined || c.lt !== undefined || c.lte !== undefined || c.approx;
  if (!numeric) return undefined;
  if (typeof actual !== "number") return `expected a number, got ${show(actual)}`;
  if (c.gt !== undefined && !(actual > c.gt)) return `expected > ${c.gt}, got ${actual}`;
  if (c.gte !== undefined && !(actual >= c.gte)) return `expected >= ${c.gte}, got ${actual}`;
  if (c.lt !== undefined && !(actual < c.lt)) return `expected < ${c.lt}, got ${actual}`;
  if (c.lte !== undefined && !(actual <= c.lte)) return `expected <= ${c.lte}, got ${actual}`;
  if (c.approx && !(Math.abs(actual - c.approx[0]) <= c.approx[1])) return `expected ${c.approx[0]} ± ${c.approx[1]}, got ${actual}`;
  return undefined;
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.DEBUFF_BROWSER;
  if (executablePath) return chromium.launch({ executablePath });
  for (const channel of ["chrome", "msedge", "chromium"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // Not installed; try the next channel.
    }
  }
  throw new Error("No Chromium-based browser found. Install Chrome or Edge, or set DEBUFF_BROWSER to a browser executable.");
}

export async function runScenarios(options: RunOptions): Promise<ScenarioReport[]> {
  const files = findScenarios(options.root, options.files);
  if (!files.length) throw new Error(`No scenarios found. Add JSON files to ${join(options.root, "scenarios")}.`);
  const server = await createDevServer(options.root, { port: 0, logLevel: "error" });
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error("Dev server did not report a URL");
  const browser = await launchBrowser();
  const reports: ScenarioReport[] = [];
  try {
    for (const file of files) {
      const scenario = JSON.parse(readFileSync(file, "utf8")) as Scenario;
      const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      try {
        reports.push(await runOne(page, base, scenario.name ?? basename(file, ".json"), scenario, options));
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

async function runOne(page: Page, base: string, name: string, scenario: Scenario, options: RunOptions): Promise<ScenarioReport> {
  const started = Date.now();
  const url = new URL(scenario.page ?? "/", base);
  url.searchParams.set("debuff-scenario", "1");
  await page.goto(url.toString());
  await page.waitForFunction(hooksReady, undefined, { timeout: 15_000 });

  const call = <R>(method: string, ...args: unknown[]) => page.evaluate(callHook, [method, args] as [string, unknown[]]) as Promise<R>;
  const pluginSteps = new Map<string, StepDef>();
  for (const plugin of options.plugins ?? [])
    for (const def of plugin.scenarioSteps ?? []) pluginSteps.set(`${plugin.name}:${def.name}`, def);
  const stepContext = {
    call,
    // Playwright serialises fn into the page; the cast bridges its overloads to our simpler signature.
    evaluate: <R, A>(fn: (arg: A) => R | Promise<R>, arg: A) => page.evaluate(fn as (arg: unknown) => R | Promise<R>, arg) as Promise<R>,
  };
  const steps: StepResult[] = [];
  const captures: CaptureResult[] = [];

  for (const [index, step] of scenario.steps.entries()) {
    let message: string | undefined;
    try {
      // Plugin steps are namespaced ("plugin:step"); everything else is a built-in step.
      const key = Object.keys(step)[0] ?? "";
      if (key.includes(":")) {
        const plugin = pluginSteps.get(key);
        message = plugin
          ? await plugin.run((step as Record<string, unknown>)[key], stepContext)
          : `Unknown plugin step "${key}". Is its plugin listed in debuff.config.ts?`;
      } else {
        message = await runStep(step, call, async (capture, tolerance) => {
          const result = await compareCapture(page, options, name, capture, tolerance, await call<string>("capture"));
          captures.push(result);
          if (result.status === "diff") {
            return `capture "${capture}" differs: ${pct(result.diffRatio ?? 1)} of pixels (tolerance ${pct(tolerance)})`;
          }
          if (result.status === "missing") return `capture "${capture}" has no baseline for ${process.platform} (run with --update)`;
          return undefined;
        });
      }
    } catch (err) {
      message = err instanceof Error ? (err.message.split("\n")[0] ?? err.message) : String(err);
    }
    steps.push({ index, step, ok: !message, ...(message ? { message } : {}) });
  }

  const errors = await call<string[]>("errors");
  return {
    name,
    ok: steps.every((s) => s.ok) && errors.length === 0,
    steps,
    errors,
    captures,
    finalState: await call<unknown>("state"),
    durationMs: Date.now() - started,
  };
}

type Call = <R>(method: string, ...args: unknown[]) => Promise<R>;
type Capture = (name: string, tolerance: number) => Promise<string | undefined>;

async function runStep(step: Step, call: Call, capture: Capture): Promise<string | undefined> {
  if ("wait" in step) await call("step", step.wait);
  else if ("press" in step) await call("press", step.press);
  else if ("release" in step) await call("release", step.release);
  else if ("tap" in step) await call("tap", ...step.tap);
  else if ("pointerDown" in step) await call("pointerDown", ...step.pointerDown);
  else if ("pointerMove" in step) await call("pointerMove", ...step.pointerMove);
  else if ("pointerUp" in step) await call("pointerUp");
  else if ("set" in step) {
    for (const [path, value] of Object.entries(step.set)) {
      const dot = path.indexOf(".");
      if (dot < 1) return `set: "${path}" must be "group.key"`;
      await call("setParam", path.slice(0, dot), path.slice(dot + 1), value);
    }
  } else if ("expect" in step) {
    const state = await call<unknown>("state");
    const failures = Object.entries(step.expect).flatMap(([path, c]) => {
      const m = compare(pick(state, path), c);
      return m ? [`${path}: ${m}`] : [];
    });
    if (failures.length) return failures.join("; ");
  } else if ("capture" in step) {
    return capture(step.capture, step.tolerance ?? DEFAULT_TOLERANCE);
  } else {
    return `Unknown step: ${JSON.stringify(step)}`;
  }
  return undefined;
}

/** Baselines are per platform because font rasterisation differs between operating systems. */
async function compareCapture(
  page: Page,
  options: RunOptions,
  scenario: string,
  name: string,
  tolerance: number,
  dataUrl: string,
): Promise<CaptureResult> {
  const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const outDir = join(options.root, ".debuff", "captures", scenario);
  const baselineDir = join(options.root, "scenarios", "__baselines__", scenario);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${name}.png`);
  const baseline = join(baselineDir, `${name}.${process.platform}.png`);
  writeFileSync(path, png);

  const existed = existsSync(baseline);
  if (!existed && options.strict && !options.update) return { name, path, baseline, status: "missing" };
  if (!existed || options.update) {
    mkdirSync(baselineDir, { recursive: true });
    writeFileSync(baseline, png);
    return { name, path, baseline, status: existed ? "updated" : "new" };
  }
  const expected = `data:image/png;base64,${readFileSync(baseline).toString("base64")}`;
  const diffRatio = await page.evaluate(diffImages, [dataUrl, expected, PIXEL_THRESHOLD] as [string, string, number]);
  return { name, path, baseline, status: diffRatio <= tolerance ? "match" : "diff", diffRatio };
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export function formatScenario(r: ScenarioReport): string {
  const lines = [`${r.ok ? lime("PASS") : paint("red", "FAIL")} ${pc.bold(r.name)} ${pc.dim(`${r.durationMs} ms`)}`];
  for (const s of r.steps) if (!s.ok) lines.push(`  ${pc.red("✖")} step ${s.index} ${pc.dim(JSON.stringify(s.step))}\n    ${s.message}`);
  for (const e of r.errors) lines.push(`  ${pc.red("✖")} runtime error: ${e.split("\n")[0]}`);
  for (const c of r.captures) {
    const color = c.status === "match" ? lime : c.status === "diff" || c.status === "missing" ? (s: string) => paint("red", s) : amber;
    lines.push(`  ${pc.dim("capture")} ${c.name}: ${color(c.status)}${c.diffRatio !== undefined ? pc.dim(` (${pct(c.diffRatio)})`) : ""}`);
  }
  return lines.join("\n");
}
