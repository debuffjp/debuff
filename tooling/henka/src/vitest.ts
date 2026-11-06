/**
 * The Vitest adapter: source mutants in your files, judged by the Vitest tests that load them. Each job
 * is a child process that keeps Vitest open, with the mutant applied by a Vite plugin as the file loads,
 * so nothing on disk changes and jobs can run in parallel.
 *
 * @module
 */
import { execFileSync, fork, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BaselineJob, ChildResult, MutantJob, TestFile } from "./child.js";
import type { Adapter, MutantRun, RunResult } from "./index.js";
import { findMutants, type Parse, type SourceMutant } from "./source.js";

export interface VitestAdapterOptions {
  /** Project root: where Vitest finds its config. */
  root: string;
  /** Files or folders to mutate, relative to the root. Default `src`. */
  paths?: string[];
  /** Only mutate lines that changed since this git ref (`main`, `HEAD`). New untracked files count as changed. */
  since?: string;
  /** A run longer than this counts as caught (the mutant hung the tests). Default: 5x the baseline, at least 20 s. */
  timeoutMs?: number;
}

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const NOT_SOURCE = /\.(test|spec)\.|\.d\.[cm]?ts$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage", "test", "tests", "__tests__", "fixtures"]);
// From dist/ and from src/ under the repo's own tests, the child runs built code.
const CHILD = fileURLToPath(new URL("../dist/child.js", import.meta.url));

/** Source files under `paths`, relative to the root, sorted. */
export function sourceFiles(root: string, paths: string[] = ["src"]): string[] {
  const out: string[] = [];
  const walk = (full: string) => {
    if (!existsSync(full)) throw new Error(`henka: ${relative(root, full) || full} doesn't exist`);
    if (statSync(full).isDirectory()) {
      for (const name of readdirSync(full)) if (!SKIP_DIRS.has(name)) walk(join(full, name));
    } else if (SOURCE.test(full) && !NOT_SOURCE.test(full)) out.push(relative(root, full).split("\\").join("/"));
  };
  for (const p of paths) walk(resolve(root, p));
  return [...new Set(out)].sort();
}

/** A henka adapter that runs Vitest. Needs `vite` and `vitest` installed in the project. */
export function vitestAdapter(options: VitestAdapterOptions): Adapter & { mutants(): Promise<SourceMutant[]> } {
  const root = resolve(options.root);
  const files = sourceFiles(root, options.paths);
  if (!files.length) throw new Error(`henka: no source files to mutate under ${(options.paths ?? ["src"]).join(", ")}`);
  let loadedBy: Record<string, TestFile[]> = {};
  let timeoutMs = options.timeoutMs ?? 20_000;
  const idle: Runner[] = [];
  const all = new Set<Runner>();
  return {
    name: "vitest",
    async baseline() {
      const started = performance.now();
      const result = await runBaseline(root, files);
      if (result.errors.length) throw new Error(`henka: the tests reported errors with nothing changed: ${result.errors.join("; ")}`);
      const durationMs = Math.round(performance.now() - started);
      loadedBy = result.loadedBy;
      timeoutMs = options.timeoutMs ?? Math.max(20_000, durationMs * 5);
      return { failed: result.failed, passed: result.passed, durationMs };
    },
    async mutants() {
      const { parseSync } = await import("vite");
      const changed = options.since ? changedLines(root, options.since) : undefined;
      return files.flatMap((file) => {
        const lines = changed?.get(file);
        if (changed && !lines) return [];
        const mutants = findMutants(file, readFileSync(resolve(root, file), "utf8"), parseSync as unknown as Parse);
        return lines instanceof Set ? mutants.filter((m) => lines.has(m.line)) : mutants;
      });
    },
    async run(mutant): Promise<MutantRun> {
      const m = mutant as SourceMutant;
      const tests = loadedBy[m.file];
      if (!tests) return { failed: [], passed: 0, durationMs: 0, note: "no test loads this file" };
      const runner = idle.pop() ?? (await startRunner(root, all));
      const started = performance.now();
      const result = await runner.run({ mutant: m, tests }, timeoutMs);
      const durationMs = Math.round(performance.now() - started);
      if (result === "timeout") {
        all.delete(runner);
        return { failed: [`(timed out after ${Math.round(timeoutMs / 1000)} s)`], passed: 0, durationMs };
      }
      idle.push(runner);
      if (result.refused) return { unviable: result.refused };
      return {
        failed: [...result.failed, ...result.errors.map((e) => `(error) ${e}`)],
        passed: result.passed,
        durationMs,
      } satisfies RunResult;
    },
    async close() {
      await Promise.all([...all].map((r) => r.close()));
    },
  };
}

interface Runner {
  run(job: MutantJob, timeoutMs: number): Promise<ChildResult | "timeout">;
  close(): Promise<void>;
}

/** A child that keeps Vitest open between mutants. It's killed, not reused, when a mutant times out. */
async function startRunner(root: string, all: Set<Runner>): Promise<Runner> {
  // Its own process group on POSIX, so a timeout also kills the Vitest worker stuck in the mutant's loop.
  const child = fork(CHILD, [], { cwd: root, stdio: ["ignore", "ignore", "pipe", "ipc"], detached: process.platform !== "win32" });
  let stderr = "";
  child.stderr?.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-10_000);
  });
  const exited = new Promise<number | null>((done) => child.on("exit", done));
  const next = () =>
    Promise.race([
      new Promise<unknown>((done) => child.once("message", done)),
      exited.then((code) => {
        throw new Error(`henka: Vitest exited with ${code} before reporting.\n${stderr.trim()}`);
      }),
    ]);
  await next();
  const runner: Runner = {
    async run(job, timeoutMs) {
      child.send(job);
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<"timeout">((done) => {
        timer = setTimeout(() => {
          killTree(child.pid);
          done("timeout");
        }, timeoutMs);
      });
      try {
        return await Promise.race([next() as Promise<ChildResult>, timedOut]);
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      if (child.exitCode === null && child.connected) child.send("close");
      await exited;
    },
  };
  all.add(runner);
  return runner;
}

function killTree(pid: number | undefined) {
  if (pid === undefined) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

/** The baseline, in a child of its own: it turns on what the mutant runs leave off. */
async function runBaseline(root: string, related: string[]): Promise<ChildResult> {
  const dir = mkdtempSync(join(tmpdir(), "henka-"));
  try {
    const job: BaselineJob = { root, related, result: join(dir, "result.json") };
    writeFileSync(join(dir, "job.json"), JSON.stringify(job));
    const child = spawn(process.execPath, [CHILD, join(dir, "job.json")], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    const code = await new Promise<number | null>((done) => child.on("close", done));
    if (!existsSync(job.result)) throw new Error(`henka: Vitest exited with ${code} before reporting.\n${stderr.trim()}`);
    return JSON.parse(readFileSync(job.result, "utf8")) as ChildResult;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Lines changed since `ref`, by file relative to the root. Untracked files are `"all"`. */
export function changedLines(root: string, ref: string): Map<string, Set<number> | "all"> {
  const out = new Map<string, Set<number> | "all">();
  const top = git(root, ["rev-parse", "--show-toplevel"]).trim();
  const fromTop = (p: string) => relative(root, join(top, p)).split("\\").join("/");
  let file: string | undefined;
  for (const line of git(root, ["diff", "--unified=0", "--no-color", "--no-ext-diff", ref, "--", "."]).split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line === "+++ /dev/null" ? undefined : fromTop(line.slice(6));
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || !file) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    const lines = out.get(file);
    const set = lines instanceof Set ? lines : new Set<number>();
    for (let i = start; i < start + count; i++) set.add(i);
    out.set(file, set);
  }
  for (const f of git(root, ["ls-files", "--others", "--exclude-standard", "."]).split("\n")) {
    if (f) out.set(f, "all");
  }
  return out;
}

/**
 * Variables that point git at a repository other than the one in `cwd`. Git sets them for hooks, so henka
 * run from a hook (or a test run by one) would read, or write to, the wrong repository. The same list as
 * create-debuff's `gitEnv`.
 */
const REPO_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
  "GIT_NAMESPACE",
];

/** The environment without the repository-locating variables, so git finds the repository from `cwd`. */
export function gitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const clean = { ...env };
  for (const name of REPO_VARS) delete clean[name];
  return clean;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: gitEnv(), maxBuffer: 64 * 1024 * 1024 });
}
