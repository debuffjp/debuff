/**
 * `jobs`: run test files across worker processes. Each worker is a whole keiko run (its own Vite server,
 * games and globals) given one file at a time, so nothing a run patches (console, error handlers, node:fs)
 * is shared. Workers record into the queue only through this process, which merges and saves once.
 */
import { type ChildProcess, fork } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { realNow } from "./clock.js";
import type { ImpactStore } from "./impact.js";
import { keikoVersion, type RunPart, type RunTestsOptions, type TestFailure, type TestReport, type TestResult } from "./runner.js";

/** What this process sends a worker: a file to run, with the options that survive a process boundary. */
export interface PoolRun {
  file: string;
  /** Which worker this is (0-based): it picks the worker's own Vite cache folder. */
  slot: number;
  options: Pick<RunTestsOptions, "root" | "filter" | "debuff" | "queue" | "changed">;
}

/** What a worker sends back: each result as it finishes, then the file's report, or why it couldn't run. */
export type PoolMessage =
  | { type: "result"; result: TestResult }
  | { type: "done"; report: TestReport; part: RunPart | undefined }
  | { type: "error"; message: string; stack?: string };

// Under Vitest this module runs from src/. Workers run the sources too (never a dist/ that may be stale or
// mid-build), with Node's TypeScript support and a hook for imports that name the `.js` a source builds to.
const fromSource = import.meta.url.endsWith(".ts");
const WORKER = fileURLToPath(new URL(fromSource ? "./pool-worker.ts" : "./pool-worker.js", import.meta.url));
const RESOLVE_TS = `export async function resolve(s, c, next) {
  try { return await next(s, c); }
  catch (e) { if (s.startsWith(".") && s.endsWith(".js")) return next(s.slice(0, -3) + ".ts", c); throw e; }
}`;
const REGISTER = `import { register } from "node:module"; register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(RESOLVE_TS)}`)});`;
const SOURCE_ARGS = ["--experimental-transform-types", "--no-warnings", "--import", `data:text/javascript,${encodeURIComponent(REGISTER)}`];

export async function runPool(options: RunTestsOptions, files: string[]): Promise<TestReport> {
  const started = realNow();
  const { root } = options;
  const queue = options.queue ?? (options.changed ? "default" : undefined);
  const store = queue ? await openStore(root, queue) : undefined;
  const order = slowestFirst(files, store?.lastMs() ?? new Map());

  const results = new Map<string, TestResult[]>(files.map((f) => [f, []]));
  const outside: TestFailure[] = [];
  const parts: RunPart[] = [];
  let unchanged: number | undefined;
  let due: TestReport["due"];
  let crashed = false;
  const base: PoolRun["options"] = {
    root,
    ...(options.filter ? { filter: options.filter } : {}),
    ...(options.debuff === undefined ? {} : { debuff: options.debuff }),
    ...(queue ? { queue } : {}),
    ...(options.changed ? { changed: true } : {}),
  };

  const work = async (slot: number) => {
    let child: ChildProcess | undefined;
    try {
      for (let file = order.shift(); file !== undefined; file = order.shift()) {
        child ??= spawn();
        const outcome = await runFile(child, { file, slot, options: base }, (r) => {
          results.get(file as string)?.push(r);
          options.onResult?.(r);
        });
        if (outcome.type === "done") {
          outside.push(...outcome.report.outside);
          if (outcome.report.unchanged !== undefined) unchanged = (unchanged ?? 0) + outcome.report.unchanged;
          if (outcome.report.due) due = { ...due, ...outcome.report.due };
          if (outcome.part) parts.push(outcome.part);
        } else {
          crashed = true;
          outside.push({ kind: "Error", message: `${file}: ${outcome.message}`, ...(outcome.stack ? { stack: outcome.stack } : {}) });
          // A worker that died, or whose run threw, may be in any state: the next file gets a fresh one.
          await stop(child);
          child = undefined;
        }
      }
    } finally {
      if (child) await stop(child);
    }
  };
  const jobs = Math.min(options.jobs ?? 1, files.length);
  await Promise.all(Array.from({ length: jobs }, (_, slot) => work(slot)));

  const report: TestReport = { ok: true, passed: 0, failed: 0, skipped: 0, todo: 0, durationMs: 0, results: [], outside };
  // In file order, as a run in one process reports them.
  for (const file of files) report.results.push(...(results.get(file) ?? []));
  for (const r of report.results) {
    if (r.status === "pass") report.passed++;
    else if (r.status === "fail") report.failed++;
    else if (r.status === "skip") report.skipped++;
    else report.todo++;
  }
  if (unchanged !== undefined) report.unchanged = unchanged;
  if (due) report.due = due;
  if (options.filter && !crashed && parts.every((p) => p.matched === 0)) {
    outside.push({ kind: "Error", message: `no test name contains "${options.filter}", so nothing ran. Check the -t/--filter text.` });
  }
  if (store) {
    for (const p of parts) if (p.records) store.merge(p.records.tests, p.records.env);
    // As in one process: tests whose files are gone leave the queue, but only after a run that loaded every file.
    if (!options.files?.length && !crashed) store.prune(new Set(parts.flatMap((p) => p.records?.ids ?? [])));
    store.save();
  }
  report.ok = report.failed === 0 && report.outside.length === 0;
  report.durationMs = Math.round(realNow() - started);
  return report;
}

async function openStore(root: string, queue: string): Promise<ImpactStore> {
  const { ImpactStore, cacheDir } = await import("./impact.js");
  return new ImpactStore(root, queue, cacheDir(root), keikoVersion());
}

/** Files by how long their tests took last time, slowest first; files with no record yet go first of all. */
export function slowestFirst(files: string[], lastMs: Map<string, number>): string[] {
  const total = new Map<string, number>();
  for (const [id, ms] of lastMs) {
    const file = id.slice(0, id.indexOf(" › "));
    total.set(file, (total.get(file) ?? 0) + ms);
  }
  return [...files].sort((a, b) => (total.get(b) ?? Infinity) - (total.get(a) ?? Infinity));
}

function spawn(): ChildProcess {
  // Piped, not inherited, so whatever a game prints goes through this process's streams (debuff --json
  // moves console output to stderr, and a worker writing to the real stdout would break the JSON).
  const child = fork(WORKER, [], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    serialization: "advanced",
    // A worker inheriting --inspect would try to take the parent's debugger port.
    execArgv: fromSource ? SOURCE_ARGS : process.execArgv.filter((a) => !a.startsWith("--inspect")),
  });
  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  return child;
}

/** Run one file in a worker, until it reports the file done, fails, or exits. */
function runFile(
  child: ChildProcess,
  run: PoolRun,
  onResult: (r: TestResult) => void,
): Promise<Extract<PoolMessage, { type: "done" | "error" }>> {
  return new Promise((resolve) => {
    const onMessage = (m: PoolMessage) => {
      if (m.type === "result") return onResult(m.result);
      off();
      resolve(m);
    };
    const onExit = (code: number | null, signal: string | null) => {
      off();
      resolve({ type: "error", message: `the worker running it exited (${signal ?? `code ${code}`}) before the file finished` });
    };
    const off = () => {
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.on("exit", onExit);
    child.send(run);
  });
}

/** Let a worker finish on its own, so its output gets through; kill it if it doesn't. */
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  // "exit", not "close": on Windows a worker's pipes can stay open after it exits, and "close" never comes.
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  if (child.connected) child.disconnect();
  const timer = setTimeout(() => child.kill(), 10_000);
  await exited;
  clearTimeout(timer);
}

/** The Vite cache folder for one worker: workers pre-bundling into one folder at once would overwrite each other. */
export function workerCacheDir(root: string, slot: number): string {
  return join(root, "node_modules", ".vite", `keiko-${slot}`);
}
