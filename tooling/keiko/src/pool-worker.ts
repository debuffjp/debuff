/** A `jobs` worker: runs the files its parent sends, one at a time, and sends back what happened. */
import type { PoolMessage, PoolRun } from "./pool.js";
import { workerCacheDir } from "./pool.js";
import { debuffViteConfig, type RunPart, runTests, type TestResult, usesDebuff } from "./runner.js";
import { show } from "./values.js";

/** A failed test's game state as text, for a state that can't be copied to the parent (it holds a function). */
const asText = (r: TestResult): TestResult =>
  r.error?.game ? { ...r, error: { ...r.error, game: { ...r.error.game, state: show(r.error.game.state, 2000) } } } : r;

const send = (m: PoolMessage) => {
  try {
    process.send?.(m);
  } catch {
    if (m.type === "result") process.send?.({ ...m, result: asText(m.result) });
    else if (m.type === "done") process.send?.({ ...m, report: { ...m.report, results: m.report.results.map(asText) } });
  }
};

process.on("message", async ({ file, slot, options }: PoolRun) => {
  try {
    const debuff = options.debuff ?? usesDebuff(options.root);
    const vite = { ...(debuff ? await debuffViteConfig(options.root) : {}), cacheDir: workerCacheDir(options.root, slot) };
    let part: RunPart | undefined;
    const report = await runTests({
      ...options,
      debuff,
      vite,
      files: [file],
      onResult: (result) => send({ type: "result", result }),
      part: (p) => {
        part = p;
      },
    });
    send({ type: "done", report, part });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    send({ type: "error", message: e.message, ...(e.stack ? { stack: e.stack } : {}) });
  }
});

// Once the parent has no more files it lets go; anything a game left running mustn't keep the worker alive.
process.on("disconnect", () => setTimeout(() => process.exit(0), 5000).unref());
