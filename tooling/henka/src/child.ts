/**
 * Vitest in its own process, so a mutant that loops forever can be killed with it.
 *
 * - `child.js <job.json>` runs the baseline once and writes the result to the path the job names.
 * - `child.js` under `fork()` keeps one Vitest open and runs each mutant the parent sends, invalidating
 *   only the mutated file between runs.
 *
 * @module
 */
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { henka, type PluginState } from "./plugin.js";
import type { SourceMutant } from "./source.js";

/** A test file, by the Vitest project that runs it. @internal */
export interface TestFile {
  project: string;
  file: string;
}

/** @internal */
export interface BaselineJob {
  root: string;
  /** Source files to mutate: Vitest runs the tests related to them. */
  related: string[];
  result: string;
}

/** @internal */
export interface MutantJob {
  mutant: SourceMutant;
  tests: TestFile[];
}

/** @internal */
export interface ChildResult {
  failed: string[];
  passed: number;
  /** Source file (relative to the root) to the test files that loaded it. Baseline only. */
  loadedBy: Record<string, TestFile[]>;
  refused?: string;
  errors: string[];
}

async function open(root: string, related?: string[]) {
  const { createVitest } = await import("vitest/node");
  const state: PluginState = {};
  let result: ChildResult = { failed: [], passed: 0, loadedBy: {}, errors: [] };
  const watched = new Map((related ?? []).map((f) => [f.toLowerCase(), f]));
  const vitest = await createVitest(
    {
      root,
      ...(related ? { related } : {}),
      run: true,
      watch: false,
      passWithNoTests: true,
      // A mutant needs one failure to count as caught; the baseline needs every test.
      bail: related ? 0 : 1,
      maxWorkers: 1,
      // Vitest 5 caches transformed modules on disk across processes: a mutated file must never land there.
      fsModuleCache: false,
      coverage: { enabled: false },
      // Every module each test file ran, so a mutant only runs the test files that load its file.
      experimental: { importDurations: { limit: related ? 1_000_000 : 0 } },
      reporters: [
        {
          onTestCaseResult(test) {
            const s = test.result().state;
            if (s === "failed") result.failed.push(test.fullName);
            else if (s === "passed") result.passed++;
          },
          onTestModuleEnd(module) {
            for (const id of Object.keys(module.diagnostic().importDurations)) {
              const file = watched.get(relative(root, id).split("\\").join("/").toLowerCase());
              if (!file) continue;
              const tests = result.loadedBy[file] ?? [];
              tests.push({ project: module.project.name, file: module.moduleId });
              result.loadedBy[file] = tests;
            }
          },
          onTestRunEnd(_modules, unhandled) {
            for (const e of unhandled) result.errors.push(e.message ?? String(e));
          },
        },
      ],
    },
    { plugins: [henka({ root, state })] },
  );
  const run = async (go: () => Promise<unknown>): Promise<ChildResult> => {
    result = { failed: [], passed: 0, loadedBy: {}, errors: [] };
    try {
      await go();
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
    return { ...result, ...(state.refused ? { refused: state.refused } : {}) };
  };
  let previous: string | undefined;
  return {
    vitest,
    baseline: () => run(() => vitest.start()),
    mutant: ({ mutant, tests }: MutantJob) => {
      state.mutant = mutant;
      delete state.refused;
      for (const file of new Set([previous, mutant.file])) {
        if (!file) continue;
        const full = resolve(root, file).split("\\").join("/");
        vitest.invalidateFile(full);
        vitest.watcher.invalidates.add(full);
      }
      previous = mutant.file;
      return run(() => vitest.runTestSpecifications(tests.map((t) => vitest.getProjectByName(t.project).createSpecification(t.file))));
    },
  };
}

const [jobFile] = process.argv.slice(2);
if (jobFile) {
  const job = JSON.parse(readFileSync(jobFile, "utf8")) as BaselineJob;
  const runner = await open(job.root, job.related);
  const result = await runner.baseline();
  await runner.vitest.close();
  writeFileSync(job.result, JSON.stringify(result));
} else if (process.send) {
  const runner = await open(process.cwd());
  process.on("message", async (job: MutantJob | "close") => {
    if (job === "close") {
      await runner.vitest.close();
      process.disconnect?.();
      return;
    }
    process.send?.(await runner.mutant(job));
  });
  process.send?.("ready");
} else {
  throw new Error("henka's child runner needs a job file or an IPC channel");
}
