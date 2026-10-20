/**
 * The test runner behind `npx keiko` and `debuff test`. Most people use a CLI; tools (MCP servers,
 * CI scripts, other engines' tooling) can call {@link runTests} directly.
 *
 * @module
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { InlineConfig, ViteDevServer } from "vite";
import type { ModuleRunner } from "vite/module-runner";
import { realClearTimeout, realNow, realSetTimeout, sleep, VirtualClock } from "./clock.js";
import { type DebuffDevHooks, debuffDriver, genericDriver, type KeikoHooks } from "./driver.js";
import { type EngineWatch, watchEngines } from "./engines.js";
import { type HeadlessPage, openPage } from "./environment.js";
import { Playtest } from "./playtest.js";
import { type Booter, type PlayOptions, registry, type TestCase } from "./registry.js";
import { show } from "./values.js";

export { formatResult, formatSummary } from "./format.js";

export interface RunTestsOptions {
  /** Project root (the folder with `index.html`). */
  root: string;
  /** Test files or folders, relative to the root. Default: every `*.test.ts` (or `.js`, `.mts`, `.mjs`) under `tests/` and `src/`. */
  files?: string[];
  /** Only run tests whose full name (`describe › test`) contains this text. */
  filter?: string;
  /** Vite config for the project (plugins, aliases). Default: the project's own vite.config, if any. `debuff test` passes debuff's. */
  vite?: InlineConfig;
  /**
   * Drive the game through debuff's dev hooks. Default: on when the project depends on `@debuffjp/*`.
   * Other games are driven through `window.__KEIKO__` and keiko's virtual clock.
   */
  debuff?: boolean;
  /** Called as each test finishes, for live output. */
  onResult?: (result: TestResult) => void;
}

export interface TestResult {
  /** Test file, relative to the root, with forward slashes. */
  file: string;
  /** Enclosing `describe` names, outermost first. */
  suites: string[];
  name: string;
  /** `suites › name`. */
  fullName: string;
  status: "pass" | "fail" | "skip" | "todo";
  durationMs: number;
  error?: TestFailure;
  /** Console output from the test and the game. Kept for failures only. */
  logs: string[];
}

export interface TestFailure {
  /** `ExpectationError`, `GameError`, `TimeoutError`, `InvariantError` or the error's own name. */
  kind: string;
  message: string;
  /** The first stack frame in your code, `file:line:column` relative to the root. */
  where?: string;
  stack?: string;
  /** The game when the test failed, if one was running. */
  game?: { tick: number; time: number; scene: string | undefined; state: unknown };
}

export interface TestReport {
  ok: boolean;
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  durationMs: number;
  results: TestResult[];
  /** Errors a game raised while no test was running (between tests, or after its test ended). They fail the run. */
  outside: TestFailure[];
}

const TEST_FILE = /\.test\.(ts|mts|js|mjs)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".debuff", ".git", "coverage"]);

/** Test files under `tests/` and `src/`, sorted, as paths relative to the root. */
export function findTests(root: string, files: string[] = []): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (TEST_FILE.test(name)) out.push(relative(root, path).split("\\").join("/"));
    }
  };
  if (files.length) {
    // Files run as given (in order, each once); folders contribute the test files inside them.
    const given: string[] = [];
    for (const f of files) {
      const full = resolve(root, f);
      const rel = relative(root, full);
      if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel)) {
        throw new Error(`${f} is outside the project (${root}). keiko only runs test files inside the project root.`);
      }
      if (existsSync(full) && statSync(full).isDirectory()) {
        const before = out.length;
        walk(full);
        given.push(...out.splice(before).sort());
      } else given.push(rel.split("\\").join("/"));
    }
    return [...new Set(given)];
  }
  walk(join(root, "tests"));
  walk(join(root, "src"));
  return out.sort();
}

/** True when the project's package.json depends on a debuff package. */
export function usesDebuff(root: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    return [pkg.dependencies, pkg.devDependencies].some((deps) => Object.keys(deps ?? {}).some((d) => d.startsWith("@debuffjp/")));
  } catch {
    return false;
  }
}

/**
 * debuff's Vite config (its plugin serves the asset manifest), loaded from the project's `@debuffjp/cli`
 * so `npx keiko` runs a debuff game the way `npx debuff test` does.
 */
export async function debuffViteConfig(root: string): Promise<InlineConfig> {
  let cli: { viteConfig?: (root: string) => Promise<InlineConfig> };
  try {
    cli = await import(pathToFileURL(createRequire(join(root, "package.json")).resolve("@debuffjp/cli")).href);
  } catch {
    throw new Error(
      "This is a debuff project, but keiko can't load @debuffjp/cli from it, so debuff's Vite plugin (the asset manifest) " +
        "would be missing. Install it (npm i -D @debuffjp/cli) and run `npx debuff test`, or pass --no-debuff.",
    );
  }
  if (typeof cli.viteConfig !== "function") throw new Error("@debuffjp/cli is too old for keiko: update it, or run `npx debuff test`.");
  return cli.viteConfig(root);
}

/** The module scripts a page loads, in order: `<script type="module" src="/src/main.ts">`. */
export function pageScripts(html: string): string[] {
  const scripts: string[] = [];
  // Commented-out tags don't load (an unclosed comment runs to the end of the file).
  const live = html.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  for (const tag of live.matchAll(/<script\b[^>]*>/gi)) {
    const attrs = tag[0];
    if (!/\btype\s*=\s*(?:"module"|'module'|module(?=[\s/>]))/i.test(attrs)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (src) scripts.push(src);
  }
  return scripts;
}

/**
 * Run logic tests: start the project's Vite server once, load each test file, and run its tests one at a
 * time, each with a fresh headless game. Never throws for a failing test; check `report.ok`.
 */
export async function runTests(options: RunTestsOptions): Promise<TestReport> {
  const started = realNow();
  const root = resolve(options.root);
  const files = findTests(root, options.files);
  const report: TestReport = { ok: true, passed: 0, failed: 0, skipped: 0, todo: 0, durationMs: 0, results: [], outside: [] };
  if (!files.length) return report;

  const debuff = options.debuff ?? usesDebuff(root);
  if (debuff && !options.vite) options = { ...options, vite: await debuffViteConfig(root) };
  const { createServer, createRunnableDevEnvironment } = await import("vite");
  const server: ViteDevServer = await createServer({
    root,
    ...options.vite,
    logLevel: "error",
    clearScreen: false,
    server: { ...options.vite?.server, port: 0, strictPort: false, hmr: false, watch: null },
    environments: {
      ...options.vite?.environments,
      // The game's modules resolve and bundle as they would for a browser (browser builds of packages,
      // CommonJS pre-bundled to ESM), but run here. Dependencies are evaluated fresh with every game, so
      // nothing an engine keeps in module scope leaks between tests. keiko itself stays a Node module.
      [ENVIRONMENT]: {
        consumer: "server",
        resolve: {
          noExternal: true,
          external: ["keiko"],
          conditions: ["browser", "module", "import", "development|production"],
          externalConditions: ["node", "import"],
          mainFields: ["browser", "module", "jsnext:main", "jsnext"],
        },
        optimizeDeps: { noDiscovery: false, entries: [...new Set(["index.html", ...files])] },
        dev: { createEnvironment: (name, config) => createRunnableDevEnvironment(name, config, { runnerOptions: { hmr: false } }) },
      },
    },
  });
  await server.listen();
  const origin = server.resolvedUrls?.local[0];
  if (!origin) throw new Error("The Vite dev server didn't report a URL");
  const modules = (server.environments[ENVIRONMENT] as unknown as { runner: ModuleRunner }).runner;
  // Count module loads in flight, including a game's dynamic import()s, so loading waits for them too.
  let moduleLoads = 0;
  const runner = modules as unknown as Record<"cachedModule" | "cachedRequest", (...args: unknown[]) => Promise<unknown>>;
  for (const method of ["cachedModule", "cachedRequest"] as const) {
    const original = runner[method].bind(modules);
    runner[method] = (...args) => {
      moduleLoads++;
      return original(...args).finally(() => {
        moduleLoads--;
      });
    };
  }

  const reg = registry();
  let firstBoot = true;
  let page: HeadlessPage | undefined;
  let engines: EngineWatch | undefined;
  const closePage = async () => {
    reg.current = undefined;
    const p = page;
    page = undefined;
    // Let the game's pending loads (decoding audio, fetching assets) finish while its page still exists,
    // so they don't fail against a closed page and get reported as errors.
    await p?.settle(2000);
    await p?.dispose();
    engines?.dispose();
    engines = undefined;
  };

  const booter: Booter = {
    async boot(play: PlayOptions, hooks) {
      // A test that already ended (it timed out, but its body kept going) must never touch the page:
      // by now it belongs to the next test.
      const run = running.getStore();
      const alive = () => {
        if (run && !run.live)
          throw new Error(`play(): test "${run.name}" kept running after its timeout. Make sure it awaits everything it starts.`);
      };
      alive();
      await closePage();
      alive();
      const pagePath = (play.page ?? "index.html").split("\\").join("/");
      const htmlFile = join(root, pagePath);
      if (!existsSync(htmlFile)) throw new Error(`play(): no page at ${pagePath}. Pass { page: "…html" } relative to the project root.`);
      const html = readFileSync(htmlFile, "utf8");
      const scripts = pageScripts(html);
      if (!scripts.length) throw new Error(`play(): ${pagePath} has no <script type="module" src="…">, so there's no game to boot.`);
      // `epoch` isn't public: test.deterministic moves the date for its second run.
      const { epoch } = play as PlayOptions & { epoch?: number };
      const clock = new VirtualClock({
        ...(play.seed === undefined ? {} : { seed: play.seed }),
        ...(play.fps ? { fps: play.fps } : {}),
        ...(epoch === undefined ? {} : { epoch }),
      });
      page = openPage({
        origin,
        path: `/${pagePath.replace(/(^|\/)index\.html$/, "$1")}`,
        html,
        clock,
        busy: () => moduleLoads > 0,
        ...(play.viewport ? { viewport: play.viewport } : {}),
        // debuff renders the same on either backend; its Canvas 2D path is the cheaper one to run headless.
        webgl: play.webgl ?? !debuff,
        // debuff games stop their loop and wait for steps when opened this way.
        search: debuff ? { "debuff-scenario": "1" } : {},
      });
      const opened = page;
      // Before the game's scripts run, so engines that announce themselves are seen.
      engines = watchEngines(page.window as unknown as Window);
      // Fresh module instances for every game: the game's top-level code runs again in the new page.
      modules.clearCache();
      // The first game in a run also waits for Vite to pre-bundle the dependencies, which on a cold
      // cache can take far longer than booting does.
      const bootMs = play.timeout ?? (firstBoot ? 60_000 : 10_000);
      firstBoot = false;
      const bootLimit = realNow() + bootMs;
      for (const src of scripts) {
        try {
          // A browser keeps running frames and timers while a module awaits at the top level (an engine's
          // `await game.start()` waiting on its loader). Do the same, or the game would wait forever.
          let done = false;
          const imported = modules.import(new URL(src, `${origin}${pagePath}`).pathname).finally(() => {
            done = true;
          });
          imported.catch(() => {});
          while (!done) {
            // Before each frame, wait until the page is quiet, so how many frames boot takes doesn't depend
            // on network or machine speed.
            await Promise.race([imported, opened.settle(Math.max(0, bootLimit - realNow()))]);
            alive();
            if (done) break;
            if (realNow() > bootLimit) throw new Error(`it was still loading after ${bootMs} ms`);
            if (debuff) clock.advanceTime(clock.stepMs);
            else clock.advance(1);
          }
          await imported;
          alive();
        } catch (err) {
          alive();
          throw new Error(`play(): the game threw while loading ${src}: ${err instanceof Error ? err.message : String(err)}`, {
            cause: err,
          });
        }
      }
      const w = opened.window as unknown as Window & { __DEBUFF_DEV__?: DebuffDevHooks; __KEIKO__?: KeikoHooks };
      const current = opened;
      const init = {
        root,
        window: w as unknown as Window,
        settle: (timeout?: number) => current.settle(timeout),
        loading: () => current.inflight > 0,
        engine: () => engines?.info(),
        ...(hooks.onStep ? { onStep: hooks.onStep } : {}),
      };
      const limit = realNow() + (play.timeout ?? 10_000);
      let game: Playtest | undefined;
      for (;;) {
        // debuff games are driven through their dev hooks once installed; anything else through __KEIKO__ and the clock.
        const dev = w.__DEBUFF_DEV__;
        if (dev?.controlled) game ??= new Playtest(debuffDriver(dev, clock), init);
        else if (!debuff) game ??= new Playtest(genericDriver(w, clock), init);
        // Ready once the game's first loads have finished and it says so (debuff: a scene is active).
        const loading = current.inflight > 0;
        const ready = game && !loading && (play.ready ? play.ready(game) : game.driver.kind !== "debuff" || game.scene !== undefined);
        if (game && ready) break;
        if (realNow() > limit) {
          throw new Error(
            debuff && !dev
              ? "play(): the game never installed its dev hooks. Add `game.use(devTools({ input }))` from @debuffjp/dev inside `if (import.meta.env.DEV)`."
              : play.ready
                ? "play(): the game loaded, but your `ready` check never passed."
                : "play(): the game loaded, but no scene became active. Call `game.go(…)`, or pass a `ready` check to play().",
          );
        }
        // Let asset loads and promise callbacks settle. Games on the virtual clock may also need frames to boot
        // (engines often start their scenes a frame or two in), so play one while waiting.
        // Frames advance only once the page is quiet, so boot is deterministic whatever the network does.
        await current.settle(Math.max(0, limit - realNow()));
        alive();
        if (game && game.driver.kind !== "debuff") game.driver.step(1);
        else await sleep(2);
        alive();
      }
      await current.settle(Math.max(0, limit - realNow()));
      alive();
      if (play.params) game.set(play.params);
      // A browser paints a game's first frame before a player can act, and engines often need it (to build
      // scenes, or to hit-test pointers against what they drew). debuff games wait for steps from tick 0.
      if (game.driver.kind !== "debuff") game.driver.step(1);
      reg.current = game;
      return game;
    },
  };
  reg.booter = booter;

  // A game's async work (asset loads, promise chains) can fail at any moment, including between tests.
  // Errors during a test fail that test; anything else is reported once at the end, never a crash.
  const onStray = (err: unknown) => {
    // A test that outlived its timeout already failed; what it does later isn't the next test's fault.
    const from = running.getStore();
    if (from && !from.live) return;
    if (strays.current) strays.current.push(err);
    else report.outside.push(describeFailure(err, root, undefined));
  };
  process.on("unhandledRejection", onStray);
  process.on("uncaughtException", onStray);
  try {
    // Collect every test first, so `.only` anywhere narrows the whole run.
    const all: TestCase[] = [];
    for (const file of files) {
      reg.file = file;
      reg.tests = [];
      reg.suites = [];
      reg.fileHooks = { before: [], after: [] };
      try {
        await modules.import(`/${file}`);
      } catch (err) {
        all.push({ file, suites: [], name: LOAD_FAILURE, fn: () => Promise.reject(err), mode: "run", timeout: 0 });
        continue;
      }
      all.push(...reg.tests);
    }
    const focused = all.some((t) => t.mode === "only");
    const filter = options.filter?.toLowerCase();
    let matched = 0;

    for (const t of all) {
      const fullName = [...t.suites, t.name].join(" › ");
      const base = { file: t.file, suites: t.suites, name: t.name, fullName, logs: [] as string[] };
      // A filter leaves other tests out of the report entirely; `.skip` and `.only` keep them, marked skipped.
      // A file that failed to load is always reported: its tests can't be filtered, and hiding it would pass the run.
      const loadFailure = t.name === LOAD_FAILURE && t.suites.length === 0;
      if (filter && !loadFailure && !fullName.toLowerCase().includes(filter)) continue;
      if (filter && !loadFailure) matched++;
      let result: TestResult;
      if (t.mode === "todo") result = { ...base, status: "todo", durationMs: 0 };
      else if (t.mode === "skip" || (focused && t.mode !== "only")) result = { ...base, status: "skip", durationMs: 0 };
      else result = await runOne(t, base, root, closePage);
      report.results.push(result);
      if (result.status === "pass") report.passed++;
      else if (result.status === "fail") report.failed++;
      else if (result.status === "skip") report.skipped++;
      else report.todo++;
      options.onResult?.(result);
    }
    if (filter && matched === 0) {
      report.outside.push({
        kind: "Error",
        message: `no test name contains "${options.filter}", so nothing ran. Check the -t/--filter text.`,
      });
    }
  } finally {
    await closePage();
    // Let imports a game started finish before the server goes away (they'd fail with a closed transport).
    for (let waited = 0; moduleLoads > 0 && waited < 2000; waited += 10) await sleep(10);
    await sleep(0);
    process.off("unhandledRejection", onStray);
    process.off("uncaughtException", onStray);
    reg.booter = undefined;
    await modules.close();
    await server.close();
  }
  report.ok = report.failed === 0 && report.outside.length === 0;
  report.durationMs = Math.round(realNow() - started);
  return report;
}

/** The name of the failure a test file that can't be loaded reports in place of its tests. */
const LOAD_FAILURE = "(loading the file)";

/** The test whose body is running, through every async step it takes, so late `play()` calls can be refused. */
const running = new AsyncLocalStorage<{ name: string; live: boolean }>();

/** The Vite environment games run in. */
const ENVIRONMENT = "keiko";

/** Where the runner's error listener sends a game's stray errors: the running test's list, if any. */
const strays: { current: unknown[] | undefined } = { current: undefined };

async function runOne(
  t: TestCase,
  base: Omit<TestResult, "status" | "durationMs">,
  root: string,
  closePage: () => Promise<void>,
): Promise<TestResult> {
  const reg = registry();
  const logs: string[] = [];
  const restoreConsole = captureConsole(logs);
  const stray: unknown[] = [];
  strays.current = stray;
  const t0 = realNow();
  let error: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = { name: base.fullName, live: true };
  try {
    const timeout =
      t.timeout > 0
        ? new Promise<never>((_, reject) => {
            timer = realSetTimeout(() => reject(new Error(`the test took longer than ${t.timeout} ms of real time`)), t.timeout);
          })
        : undefined;
    const body = running.run(run, () => Promise.resolve().then(() => t.fn()));
    await (timeout ? Promise.race([body, timeout]) : body);
    // Let pending asset loads and promise callbacks settle, so their errors belong to this test.
    await sleep(0);
    if (stray.length) error = stray[0];
  } catch (err) {
    error = err;
  } finally {
    run.live = false;
    realClearTimeout(timer);
    strays.current = undefined;
    restoreConsole();
  }
  const durationMs = Math.round((realNow() - t0) * 10) / 10;
  const failure = error === undefined ? undefined : describeFailure(error, root, reg.current);
  await closePage();
  return failure ? { ...base, status: "fail", durationMs, error: failure, logs } : { ...base, status: "pass", durationMs };
}

function describeFailure(error: unknown, root: string, game: Playtest | undefined): TestFailure {
  const err = error instanceof Error ? error : new Error(show(error));
  const failure: TestFailure = { kind: err.name, message: err.message };
  if (err.stack) failure.stack = err.stack;
  const where = firstOwnFrame(err.stack ?? "", root);
  if (where) failure.where = where;
  if (game) {
    try {
      const d = game.driver;
      failure.game = { tick: d.tick(), time: Math.round(d.time() * 1000) / 1000, scene: d.scene(), state: d.state() };
    } catch {
      // The game is too broken to describe; the error says enough.
    }
  }
  return failure;
}

/** This package's own code (src or dist), whose frames never point at the problem. */
const SELF = `${dirname(fileURLToPath(import.meta.url))
  .split("\\")
  .join("/")}/`;

/** The first stack frame in the project (not node_modules, not this package), as `file:line:col`. */
export function firstOwnFrame(stack: string, root: string): string | undefined {
  const norm = (p: string) => p.split("\\").join("/");
  const base = `${norm(root)}/`;
  for (const line of stack.split("\n").slice(1)) {
    const t = line.trim().replace(/^at\s+/, "");
    const m = /:(\d+):(\d+)\)?$/.exec(t);
    if (!m) continue;
    let loc = t.slice(0, m.index);
    // "fn (path:1:2)" names a function; the path follows the last " (" (paths may hold parentheses too).
    if (t.endsWith(")")) {
      const open = loc.indexOf(" (");
      loc = open >= 0 ? loc.slice(open + 2) : loc.replace(/^\(/, "");
    }
    // file:///C:/x on Windows, file:///home/x elsewhere: keep the POSIX root slash, drop it before a drive letter.
    let raw = loc.replace(/^file:\/\//, "").replace(/^\/([A-Za-z]:)/, "$1");
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // Not URL-encoded after all.
    }
    const file = norm(raw);
    if (file.includes("/node_modules/") || file.toLowerCase().startsWith(SELF.toLowerCase())) continue;
    if (!file.toLowerCase().startsWith(base.toLowerCase())) continue;
    return `${file.slice(base.length)}:${m[1]}:${m[2]}`;
  }
  return undefined;
}

function captureConsole(logs: string[]): () => void {
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const original = methods.map((m) => console[m]);
  for (const m of methods) {
    console[m] = (...args: unknown[]) => {
      logs.push(`${m === "log" ? "" : `${m}: `}${args.map((a) => (typeof a === "string" ? a : show(a, 400))).join(" ")}`);
    };
  }
  return () => {
    methods.forEach((m, i) => {
      console[m] = original[i] as (typeof console)[typeof m];
    });
  };
}
