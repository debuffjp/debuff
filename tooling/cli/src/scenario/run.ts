import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { amber, lime, paint, pc } from "create-debuff";
import type { Browser, Page } from "playwright-core";
import { checkViewport, type Renderer } from "../config.js";
import { DebuffError } from "../errors.js";
import type { StepDef } from "../plugin.js";
import { createDevServer } from "../vite.js";
import { analyzeFlashes, contrastGrid, contrastRatio, FLASH_GRID } from "./a11y.js";
import { callHook, callHooks, diffImages, hooksProbe, hooksReady, sampleFrames, stepUntil } from "./browser.js";
import type { CaptureResult, Comparison, RunOptions, Scenario, ScenarioReport, Step, StepResult } from "./types.js";

/** Pixels whose summed RGB delta exceeds this count as different (absorbs anti-aliasing noise). */
const PIXEL_THRESHOLD = 48;
const DEFAULT_TOLERANCE = 0.002;
/** `until` gives up after this many steps unless the step says otherwise: ten seconds at 60 Hz. */
const DEFAULT_WITHIN = 600;
/** The default browser viewport for scenarios and fuzzing, in CSS pixels. */
export const VIEWPORT: [number, number] = [960, 540];

export function findScenarios(root: string, files: string[]): string[] {
  if (files.length) return files.map((f) => join(root, f));
  const dir = join(root, "scenarios");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(dir, f));
}

/**
 * Baselines no scenario took after a full run, relative to the root: folders under `scenarios/__baselines__/` with no
 * scenario of that name, and captures a passing scenario no longer takes (on any platform). A failed scenario may have
 * stopped before its later captures, so its folder is left alone.
 */
export function unusedBaselines(root: string, reports: ScenarioReport[]): string[] {
  const dir = join(root, "scenarios", "__baselines__");
  if (!existsSync(dir)) return [];
  const byName = new Map(reports.map((r) => [r.name, r]));
  const unused: string[] = [];
  for (const scenario of readdirSync(dir).sort()) {
    const report = byName.get(scenario);
    const rel = `scenarios/__baselines__/${scenario}`;
    if (!report) {
      unused.push(`${rel}/`);
      continue;
    }
    if (!report.ok) continue;
    const taken = new Set(report.captures.map((c) => c.name));
    for (const file of readdirSync(join(dir, scenario)).sort()) {
      const capture = file.replace(/\.[^.]+\.png$/, "");
      if (file.endsWith(".png") && !taken.has(capture)) unused.push(`${rel}/${file}`);
    }
  }
  return unused;
}

/** Read a dotted path, e.g. "state.player.x". */
export function pick(obj: unknown, path: string): unknown {
  const value = path
    .split(".")
    .reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
  // Event counts start at 0: an event the game hasn't emitted yet just isn't in the map.
  return value === undefined && path.startsWith("events.") ? 0 : value;
}

const COMPARISON_KEYS = ["eq", "gt", "gte", "lt", "lte", "approx"];

/**
 * Why `c` isn't a comparison, or undefined if it is. Catches the easy slip of writing a bare value,
 * `{ "state.x": 0 }`, where `{ "state.x": { "eq": 0 } }` was meant.
 */
export function comparisonError(c: unknown): string | undefined {
  const show = (v: unknown) => JSON.stringify(v) ?? String(v);
  if (c === null || typeof c !== "object" || Array.isArray(c))
    return `expected a comparison object like { "eq": ${show(c)} }, got ${show(c)}. Comparisons are eq, gt, gte, lt, lte and approx`;
  if (!Object.keys(c).some((k) => COMPARISON_KEYS.includes(k)))
    return `expected a comparison object with eq, gt, gte, lt, lte or approx, got ${show(c)}`;
  return undefined;
}

/** Returns a failure message, or undefined if every condition holds. */
export function compare(actual: unknown, c: Comparison): string | undefined {
  const show = (v: unknown) => JSON.stringify(v) ?? String(v);
  const malformed = comparisonError(c);
  if (malformed) return malformed;
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

/** Seconds one call into the page may take before the game counts as hung. */
export const DEFAULT_STEP_TIMEOUT = 60;

/**
 * Playwright's evaluate has no timeout, so a game stuck in a loop would hang the run forever. A hung page can't be
 * recovered, only closed, so callers stop using it after this throws.
 */
export function withinTime<T>(work: Promise<T>, seconds: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new DebuffError(
            "game_hung",
            `The game stopped responding: ${what} took over ${seconds} s.`,
            "Look for an endless loop in the game's update code. If the work is just slow, raise `stepTimeout` in the scenario",
          ),
        ),
      seconds * 1000,
    );
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

/** Close a page that may be hung, without waiting on it for long: closing the browser cleans up what's left. */
export async function closePage(page: Page): Promise<void> {
  await withinTime(page.close(), 5, "closing the page").catch(() => undefined);
}

/**
 * Launch the system Chrome/Edge (or DEBUFF_BROWSER) through playwright-core. Software rendering doesn't depend on
 * the machine's graphics card.
 */
export async function launchBrowser(renderer: Renderer = "gpu"): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const args = renderer === "software" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [];
  const executablePath = process.env.DEBUFF_BROWSER;
  if (executablePath) return chromium.launch({ executablePath, args });
  // Why each channel failed, as "missing" or "launch failed" (never the message, which has paths): an installed
  // browser that won't start is debuff's problem to fix, so automatic papercuts send this.
  const channels: Record<string, string> = {};
  for (const channel of ["chrome", "msedge", "chromium"]) {
    try {
      return await chromium.launch({ channel, args });
    } catch (err) {
      channels[channel] = /executable doesn't exist|is not found|not installed/i.test(String(err)) ? "missing" : "launch failed";
    }
  }
  throw Object.assign(
    new Error("No Chromium-based browser found. Install Chrome or Edge, or set DEBUFF_BROWSER to a browser executable."),
    { channels },
  );
}

export async function runScenarios(options: RunOptions): Promise<ScenarioReport[]> {
  const files = findScenarios(options.root, options.files);
  if (!files.length)
    throw new DebuffError(
      "nothing_to_run",
      `No scenarios found. Add JSON files to ${join(options.root, "scenarios")}.`,
      "Add a scenario such as scenarios/smoke.json; the format is in https://debuff.jp/docs/scenarios",
    );
  const server = await createDevServer(options.root, { port: 0, logLevel: "error" });
  await server.listen();
  const address = server.httpServer?.address();
  const base =
    server.resolvedUrls?.local[0] ??
    server.resolvedUrls?.network[0] ??
    (address && typeof address === "object" ? `http://localhost:${address.port}/` : undefined);
  if (!base)
    throw new DebuffError(
      "config_invalid",
      "The dev server started without a URL to open.",
      "Check `server` in vite.config / debuff.config.ts (host, port, middlewareMode), then run `npx debuff dev` to see what it prints",
    );
  const browser = await launchBrowser(options.renderer);
  const reports: ScenarioReport[] = [];
  try {
    for (const file of files) {
      const scenario = JSON.parse(readFileSync(file, "utf8")) as Scenario;
      if (scenario.viewport !== undefined) checkViewport(scenario.viewport, `${relative(options.root, file)}: viewport`);
      const [width, height] = scenario.viewport ?? options.viewport ?? VIEWPORT;
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      try {
        reports.push(await runOne(page, base, scenario.name ?? basename(file, ".json"), scenario, options));
      } finally {
        await closePage(page);
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

const DEV_TOOLS_LINE = "`if (import.meta.env.DEV) game.use(devTools({ input }))` (from @debuffjp/dev)";

/**
 * The `dev_hooks_missing` error for a page whose dev hooks weren't ready in time, naming the likely cause:
 * the URL losing `?debuff-scenario`, no import of @debuffjp/dev in src/, a failed request or console error
 * while loading, or a game that waits for something before installing its dev tools.
 */
export function devHooksMissing(
  path: string,
  probe: { hooks: boolean; scenarioQuery: boolean; url: string },
  warnings: string[],
  importsDev: boolean | undefined,
): DebuffError {
  if (probe.hooks)
    return probe.scenarioQuery
      ? new DebuffError(
          "dev_hooks_missing",
          `__DEBUFF_DEV__ is not in scenario mode: ${path} set it, but its \`controlled\` flag isn't true.`,
          "Update the dev tools to match the CLI: npm i -D @debuffjp/dev@latest",
        )
      : new DebuffError(
          "dev_hooks_missing",
          `__DEBUFF_DEV__ is not in scenario mode: the page's URL lost its ?debuff-scenario query before the dev tools started (now ${probe.url}).`,
          "Keep `location.search` when the game changes its URL (history.replaceState or a redirect), or install the dev tools before it does",
        );
  if (importsDev === false)
    return new DebuffError(
      "dev_hooks_missing",
      `__DEBUFF_DEV__ is missing on ${path}: nothing in src/ imports @debuffjp/dev, so the game never installs its dev hooks.`,
      `Add ${DEV_TOOLS_LINE} to src/main.ts`,
    );
  if (warnings.length)
    return new DebuffError(
      "dev_hooks_missing",
      `__DEBUFF_DEV__ is missing: ${path} never set it within 15 s. While loading: ${warnings[0]}`,
      "Fix that failed request or console error (open the page under `npx debuff dev` to see it), then run the scenario again",
    );
  return new DebuffError(
    "dev_hooks_missing",
    importsDev
      ? `__DEBUFF_DEV__ is missing: ${path} loaded without errors and src/ imports @debuffjp/dev, but the game didn't install its dev tools within 15 s. It may wait for a click, a sound unlock or a slow load first.`
      : `__DEBUFF_DEV__ is missing: ${path} loaded without errors, but within 15 s the game either doesn't install the dev tools from @debuffjp/dev or waits for a click, a sound unlock or a slow load first.`,
    `Install the dev tools right after \`new Game(...)\`, before anything it waits for: ${DEV_TOOLS_LINE}`,
  );
}

/** Whether a source file in `root/src` mentions @debuffjp/dev; undefined when there is no src folder. */
export function importsDevTools(root: string): boolean | undefined {
  const src = join(root, "src");
  if (!existsSync(src)) return undefined;
  return readdirSync(src, { recursive: true, withFileTypes: true }).some(
    (file) =>
      file.isFile() &&
      /\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(file.name) &&
      !relative(src, file.parentPath).split(/[\\/]/).includes("node_modules") &&
      readFileSync(join(file.parentPath, file.name), "utf8").includes("@debuffjp/dev"),
  );
}

async function runOne(page: Page, base: string, name: string, scenario: Scenario, options: RunOptions): Promise<ScenarioReport> {
  const started = Date.now();
  const url = new URL(scenario.page ?? "/", base);
  url.searchParams.set("debuff-scenario", "1");
  await page.emulateMedia({ reducedMotion: scenario.reducedMotion ? "reduce" : "no-preference" });
  const loadErrors: string[] = [];
  const onError = (e: Error) => loadErrors.push(`${e.name}: ${e.message}`);
  page.on("pageerror", onError);
  const warnings: string[] = [];
  let crashed = false;
  page.on("crash", () => {
    crashed = true;
  });
  page.on("console", (m) => {
    // The failed request is reported below, with its URL.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) warnings.push(`console error: ${m.text().split("\n")[0]}`);
  });
  page.on("requestfailed", (r) => warnings.push(`request failed: ${r.url()} (${r.failure()?.errorText ?? "unknown"})`));
  page.on("response", (r) => {
    if (r.status() >= 400) warnings.push(`request failed: ${r.url()} (HTTP ${r.status()})`);
    // The dev server answers some missing files with index.html and a 200.
    else if (r.request().resourceType() !== "document" && r.headers()["content-type"]?.startsWith("text/html"))
      warnings.push(`request failed: ${r.url()} (got the HTML page, so the file is probably missing)`);
  });
  await page.goto(url.toString());
  try {
    await page.waitForFunction(hooksReady, undefined, { timeout: 15_000 });
  } catch (err) {
    if ((err as Error | null)?.name !== "TimeoutError") throw err;
    // A game that throws while loading never gets to its dev hooks: that's this scenario failing, not debuff.
    if (loadErrors.length)
      return { name, ok: false, steps: [], errors: loadErrors, warnings, captures: [], finalState: null, durationMs: Date.now() - started };
    const probe = await page.evaluate(hooksProbe).catch(() => ({ hooks: false, scenarioQuery: true, url: url.pathname }));
    throw devHooksMissing(url.pathname, probe, warnings, importsDevTools(options.root));
  } finally {
    page.off("pageerror", onError);
  }

  const timeout = scenario.stepTimeout ?? DEFAULT_STEP_TIMEOUT;
  const guard = <R>(work: Promise<R>) => withinTime(work, timeout, "one scenario step");
  const call = <R>(method: string, ...args: unknown[]) =>
    guard(page.evaluate(callHook, [method, args] as [string, unknown[]])) as Promise<R>;
  const pluginSteps = new Map<string, StepDef>();
  for (const plugin of options.plugins ?? [])
    for (const def of plugin.scenarioSteps ?? []) pluginSteps.set(`${plugin.name}:${def.name}`, def);
  const stepContext = {
    call,
    // Playwright serialises fn into the page; the cast bridges its overloads to our simpler signature.
    evaluate: <R, A>(fn: (arg: A) => R | Promise<R>, arg: A) =>
      guard(page.evaluate(fn as (arg: unknown) => R | Promise<R>, arg)) as Promise<R>,
  };
  const steps: StepResult[] = [];
  const captures: CaptureResult[] = [];
  const checkpoints = new CheckpointCheck();

  const failed = () =>
    ({
      name,
      ok: false,
      steps,
      errors: [],
      warnings,
      captures,
      finalState: null,
      durationMs: Date.now() - started,
    }) satisfies ScenarioReport;
  const all = scenario.steps;
  let index = 0;
  while (index < all.length) {
    const batch = nextBatch(all, index);
    if (batch.length) {
      // Input, waits and checkpoints go to the page together: a recorded replay has a step on nearly every tick,
      // and one round trip each made a five-minute replay take over a minute and a half.
      const first = batch[0] as BatchStep;
      const last = batch.at(-1) as BatchStep;
      let result: Awaited<ReturnType<typeof callHooks>>;
      try {
        result = await guard(
          page.evaluate(
            callHooks,
            batch.flatMap((b) => b.calls),
          ),
        );
      } catch (err) {
        const hung = err instanceof DebuffError && err.code === "game_hung";
        let message = crashed
          ? "The browser page crashed during this step."
          : err instanceof Error
            ? (err.message.split("\n")[0] ?? err.message)
            : String(err);
        if (batch.length > 1) message = `${message} (in steps ${first.index} to ${last.index})`;
        steps.push({ index: first.index, step: first.step, ok: false, message });
        if (hung || crashed) return failed();
        index = last.index + 1;
        continue;
      }
      index = last.index + 1;
      let at = 0;
      for (const b of batch) {
        if (result.failed && result.failed.at < at + b.calls.length) {
          steps.push({ index: b.index, step: b.step, ok: false, message: result.failed.message });
          index = b.index + 1;
          break;
        }
        if ("checkpoint" in b.step) {
          const warning = checkpoints.check(b.step.checkpoint, result.checkpoints[at] as Parameters<CheckpointCheck["check"]>[1]);
          if (warning) warnings.push(warning);
        }
        steps.push({ index: b.index, step: b.step, ok: true });
        at += b.calls.length;
      }
      continue;
    }
    const step = all[index] as Step;
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
        message = await runStep(
          step,
          call,
          async (capture, tolerance) => {
            const result = await compareCapture(page, options, name, capture, tolerance, await call<string>("capture"));
            captures.push(result);
            if (result.status === "diff") {
              return captureDiffMessage(capture, result, tolerance, options.root);
            }
            if (result.status === "missing") return `capture "${capture}" has no baseline for ${process.platform} (run with --update)`;
            return undefined;
          },
          (conditions, within) =>
            guard(
              page.evaluate(stepUntil, [conditions as Record<string, Record<string, unknown>>, within] as [
                Record<string, Record<string, unknown>>,
                number,
              ]),
            ),
          (steps) => guard(page.evaluate(sampleFrames, [steps, FLASH_GRID] as [number, number])),
        );
      }
    } catch (err) {
      message = err instanceof Error ? (err.message.split("\n")[0] ?? err.message) : String(err);
      const hung = err instanceof DebuffError && err.code === "game_hung";
      if (hung || crashed) {
        steps.push({ index, step, ok: false, message: crashed ? "The browser page crashed during this step." : message });
        return failed();
      }
    }
    steps.push({ index, step, ok: !message, ...(message ? { message } : {}) });
    index++;
  }

  const errors = await call<string[]>("errors");
  return {
    name,
    ok: steps.every((s) => s.ok) && errors.length === 0,
    steps,
    errors,
    warnings,
    captures,
    finalState: await call<unknown>("state"),
    durationMs: Date.now() - started,
  };
}

type Call = <R>(method: string, ...args: unknown[]) => Promise<R>;

/**
 * Compares a replay's checkpoints with the game's, warning once at the first that differs: every later one
 * would differ too. Exported for tests.
 */
export class CheckpointCheck {
  private matched = 0;
  private done = false;

  /** `now` is what the game's `checkpoint()` hook returned, or `null` when its dev tools are too old to have one. */
  check(expected: Record<string, string>, now: { tick: number; checkpoint: Record<string, string> } | null): string | undefined {
    if (this.done) return undefined;
    if (!now) {
      this.done = true;
      return "checkpoints not checked: the game's @debuffjp/dev is older than 0.31 (npm i -D @debuffjp/dev@latest)";
    }
    const parts = [...new Set([...Object.keys(expected), ...Object.keys(now.checkpoint)])].filter((k) => expected[k] !== now.checkpoint[k]);
    if (!parts.length) {
      this.matched = now.tick;
      return undefined;
    }
    this.done = true;
    return (
      `the game's state stopped matching the recording at tick ${now.tick}: ${parts.join(", ")} ${parts.length === 1 ? "differs" : "differ"}` +
      (this.matched ? ` (it matched at tick ${this.matched}).` : ".") +
      " That's expected if the game changed since it was recorded. Otherwise this replay doesn't reproduce the session: look for Math.random()," +
      " Date.now() or real-time timers in game logic, a load finishing on a different frame, or logic that depends on the window size."
    );
  }
}

type HookCall = [method: string, args: unknown[]];

/**
 * The dev hook calls that play an input, wait or checkpoint step, a message when such a step is malformed, or
 * `undefined` for a step that needs the runner itself (assertions, captures, accessibility and plugin steps).
 */
export function hookCalls(step: Step): HookCall[] | string | undefined {
  if ("wait" in step) return [["step", [step.wait]]];
  if ("press" in step) return [["press", [step.press]]];
  if ("release" in step) return [["release", [step.release]]];
  if ("tap" in step) {
    // A key code taps that key for one step, as keiko's `game.tap("Space")` does.
    if (typeof step.tap === "string")
      return [
        ["press", [step.tap]],
        ["step", [1]],
        ["release", [step.tap]],
      ];
    if (Array.isArray(step.tap)) return [["tap", step.tap]];
    return `tap: expected a key code like "KeyT" or a point [x, y], got ${JSON.stringify(step.tap)}`;
  }
  if ("pointerDown" in step) return [["pointerDown", step.pointerDown]];
  if ("pointerMove" in step) return [["pointerMove", step.pointerMove]];
  if ("pointerUp" in step) return [["pointerUp", []]];
  if ("wheel" in step) return [["wheel", typeof step.wheel === "number" ? [step.wheel] : step.wheel]];
  if ("touchDown" in step) return [["touchDown", step.touchDown]];
  if ("touchMove" in step) return [["touchMove", step.touchMove]];
  if ("touchUp" in step) return [["touchUp", [step.touchUp]]];
  if ("pad" in step) return [["pad", [step.pad]]];
  if ("command" in step) return [["command", [step.command, ...(step.args ?? [])]]];
  if ("checkpoint" in step) return [["checkpoint", []]];
  if ("set" in step) {
    const calls: HookCall[] = [];
    for (const [path, value] of Object.entries(step.set)) {
      const dot = path.indexOf(".");
      if (dot < 1) return `set: "${path}" must be "group.key"`;
      calls.push(["setParam", [path.slice(0, dot), path.slice(dot + 1), value]]);
    }
    return calls;
  }
  return undefined;
}

interface BatchStep {
  index: number;
  step: Step;
  calls: HookCall[];
}

/** Simulation steps one batch may cover (ten seconds at 60 Hz), so a hung game is still caught within `stepTimeout`. */
const BATCH_TICKS = 600;
const BATCH_CALLS = 2000;

/**
 * The run of steps from `from` that can go to the page in one round trip: empty when that step needs the runner or
 * is malformed (`runStep` reports it). A single long `wait` is a batch of its own. Exported for tests.
 */
export function nextBatch(steps: readonly Step[], from: number): BatchStep[] {
  const batch: BatchStep[] = [];
  let ticks = 0;
  let calls = 0;
  for (let index = from; index < steps.length; index++) {
    const step = steps[index] as Step;
    const c = hookCalls(step);
    if (!Array.isArray(c)) break;
    const t = c.reduce((n, [method, args]) => n + (method === "step" ? Number(args[0]) || 0 : 0), 0);
    if (batch.length && (ticks + t > BATCH_TICKS || calls + c.length > BATCH_CALLS)) break;
    batch.push({ index, step, calls: c });
    ticks += t;
    calls += c.length;
  }
  return batch;
}

type Capture = (name: string, tolerance: number) => Promise<string | undefined>;
type Until = (conditions: Record<string, Comparison>, within: number) => Promise<{ ticks: number; met: boolean }>;
type Sample = (steps: number) => Promise<{ frames: number[][]; stepSeconds: number }>;

/** Run one built-in step through the dev hooks (`call`). Returns a failure message, if any. Exported for tests. */
export async function runStep(step: Step, call: Call, capture: Capture, until: Until, sample: Sample): Promise<string | undefined> {
  const calls = hookCalls(step);
  if (typeof calls === "string") return calls;
  if (calls) {
    for (const [method, args] of calls) await call(method, ...args);
    return undefined;
  }
  if ("expect" in step) {
    const state = await call<unknown>("state");
    const failures = Object.entries(step.expect).flatMap(([path, c]) => {
      const m = compare(pick(state, path), c);
      return m ? [`${path}: ${m}`] : [];
    });
    if (failures.length) return failures.join("; ");
  } else if ("flashes" in step) {
    if (!Number.isInteger(step.flashes) || step.flashes < 1) return `flashes: play a whole number of steps, got ${step.flashes}`;
    const { frames, stepSeconds } = await sample(step.flashes);
    const r = analyzeFlashes(frames, FLASH_GRID, FLASH_GRID, 1 / stepSeconds);
    if (!r.safe)
      return `flashing could trigger seizures: ${Math.round(r.worstArea * 100)}% of a 10° field flashed up to ${r.maxFlashesPerSecond} times a second (limit 3), worst at step ${r.atStep} of ${step.flashes}`;
  } else if ("contrast" in step) {
    const [, , w, h] = step.contrast;
    const min = step.min ?? 4.5;
    const lum = await call<number[]>("luminance", ...contrastGrid(w, h), step.contrast);
    const ratio = contrastRatio(lum);
    if (ratio < min) return `contrast ${ratio.toFixed(2)}:1 in [${step.contrast.join(", ")}] is below ${min}:1`;
  } else if ("until" in step) {
    const within = step.within ?? DEFAULT_WITHIN;
    if (!Number.isInteger(within) || within < 0) return `until: "within" must be a whole number of steps, got ${within}`;
    const malformed = Object.entries(step.until).flatMap(([path, c]) => {
      const m = comparisonError(c);
      return m ? [`${path}: ${m}`] : [];
    });
    if (malformed.length) return `until: ${malformed.join("; ")}`;
    const result = await until(step.until, within);
    if (!result.met) {
      const state = await call<unknown>("state");
      const failures = Object.entries(step.until).flatMap(([path, c]) => {
        const m = compare(pick(state, path), c);
        return m ? [`${path}: ${m}`] : [];
      });
      return `not met within ${within} steps: ${failures.join("; ") || "conditions changed back"}`;
    }
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
  if (!existed) {
    mkdirSync(baselineDir, { recursive: true });
    writeFileSync(baseline, png);
    return { name, path, baseline, status: "new" };
  }
  const expected = `data:image/png;base64,${readFileSync(baseline).toString("base64")}`;
  const result = await page.evaluate(diffImages, [dataUrl, expected, PIXEL_THRESHOLD] as [string, string, number]);
  if (result.ratio <= tolerance) return { name, path, baseline, status: "match", diffRatio: result.ratio };
  // Only rewrite baselines that actually changed, so `--update` leaves a reviewable diff.
  if (options.update) {
    writeFileSync(baseline, png);
    return { name, path, baseline, status: "updated", diffRatio: result.ratio };
  }
  let diff: string | undefined;
  if (result.image) {
    diff = join(outDir, `${name}.diff.png`);
    writeFileSync(diff, Buffer.from(result.image.slice(result.image.indexOf(",") + 1), "base64"));
  }
  return { name, path, baseline, status: "diff", diffRatio: result.ratio, ...(diff ? { diff } : {}) };
}

export const UPDATE_HINT = "If this change is intended, run `npx debuff scenario --update`.";

export function captureDiffMessage(capture: string, result: CaptureResult, tolerance: number, root: string): string {
  const rel = (p: string) => relative(root, p).split("\\").join("/");
  return [
    `capture "${capture}" differs: ${pct(result.diffRatio ?? 1)} of pixels (tolerance ${pct(tolerance)})`,
    `      actual:   ${rel(result.path)}`,
    `      baseline: ${rel(result.baseline)}`,
    ...(result.diff ? [`      diff:     ${rel(result.diff)}`] : []),
    `    ${UPDATE_HINT}`,
  ].join("\n");
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export function formatScenario(r: ScenarioReport): string {
  const lines = [`${r.ok ? lime("PASS") : paint("red", "FAIL")} ${pc.bold(r.name)} ${pc.dim(`${r.durationMs} ms`)}`];
  for (const s of r.steps) if (!s.ok) lines.push(`  ${pc.red("✖")} step ${s.index} ${pc.dim(JSON.stringify(s.step))}\n    ${s.message}`);
  for (const e of r.errors) lines.push(`  ${pc.red("✖")} runtime error: ${e.split("\n")[0]}`);
  for (const w of r.warnings) lines.push(`  ${amber("!")} ${w}`);
  for (const c of r.captures) {
    const color = c.status === "match" ? lime : c.status === "diff" || c.status === "missing" ? (s: string) => paint("red", s) : amber;
    lines.push(`  ${pc.dim("capture")} ${c.name}: ${color(c.status)}${c.diffRatio !== undefined ? pc.dim(` (${pct(c.diffRatio)})`) : ""}`);
  }
  return lines.join("\n");
}
