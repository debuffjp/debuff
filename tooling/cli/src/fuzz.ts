import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Page } from "playwright-core";
import { hooksReady } from "./scenario/browser.js";
import { launchBrowser } from "./scenario/run.js";
import type { Step } from "./scenario/types.js";
import { createDevServer } from "./vite.js";

/** Keys most small games use. Override with `keys` (KeyboardEvent.code values). */
export const DEFAULT_FUZZ_KEYS = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "Space",
  "Enter",
  "KeyZ",
  "KeyX",
];
const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"]);

export interface FuzzOptions {
  root: string;
  /** Simulated seconds of play per run (60 steps = 1 s). Default 60. */
  seconds?: number;
  /** Independent runs, each from a fresh page load. Default 3. */
  runs?: number;
  /** Seed for the input generator. Same seed, same inputs. Default: random. */
  seed?: number;
  /** Keys to press. Default: arrows, WASD, Space, Enter, Z, X. */
  keys?: string[];
  /** Flag a run as stuck when the scene's inspect() state doesn't change for this many seconds. Default 15. */
  stuckSeconds?: number;
  /** Page to open. Default "/". */
  page?: string;
}

export interface FuzzFinding {
  kind: "error" | "stuck";
  run: number;
  /** Simulation tick when it was found. */
  tick: number;
  message: string;
  /** The explained error from the dev tools (kind, where, hint), when kind is "error". */
  error?: unknown;
  /** Scenario file that replays the inputs up to this point. Run it with `debuff scenario <file>`. */
  repro: string;
}

export interface FuzzReport {
  seed: number;
  runs: number;
  /** Simulation steps played across all runs. */
  steps: number;
  findings: FuzzFinding[];
  durationMs: number;
}

/** Small, fast, seeded PRNG (mulberry32): the same seed always gives the same inputs. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type HookResult<R> = { ok: true; value: R } | { ok: false; error: string };

/**
 * Call a dev hook. If the game throws, hand the error to the page's own error reporting (so the dev tools
 * explain and source-map it, exactly as for a crash during play) and return it instead of throwing.
 */
function callSafe(page: Page, method: string, args: unknown[]): Promise<HookResult<unknown>> {
  return page.evaluate(
    ([m, a]) => {
      const hooks = (window as unknown as { __DEBUFF_DEV__: Record<string, (...x: unknown[]) => unknown> }).__DEBUFF_DEV__;
      try {
        return { ok: true as const, value: hooks[m]?.(...a) };
      } catch (err) {
        reportError(err);
        return { ok: false as const, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
      }
    },
    [method, args] as [string, unknown[]],
  );
}

/**
 * Play the game with random but plausible input: movement keys held for a while, action keys tapped.
 * Finds runtime errors and stuck states, and writes each as a replayable scenario in `.debuff/fuzz/`.
 * Deterministic: fixed steps plus a seeded game mean the recorded inputs reproduce the run exactly.
 */
export async function runFuzz(options: FuzzOptions): Promise<FuzzReport> {
  const started = Date.now();
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const runs = options.runs ?? 3;
  const budget = Math.round((options.seconds ?? 60) * 60);
  const keys = options.keys?.length ? options.keys : DEFAULT_FUZZ_KEYS;
  const stuckSteps = Math.round((options.stuckSeconds ?? 15) * 60);
  const outDir = join(options.root, ".debuff", "fuzz");
  mkdirSync(outDir, { recursive: true });

  const server = await createDevServer(options.root, { port: 0, logLevel: "error" });
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error("Dev server did not report a URL");
  const browser = await launchBrowser();
  const findings: FuzzFinding[] = [];
  let totalSteps = 0;

  try {
    for (let run = 1; run <= runs; run++) {
      const random = rng(seed + run * 7919);
      const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      try {
        const url = new URL(options.page ?? "/", base);
        url.searchParams.set("debuff-scenario", "1");
        await page.goto(url.toString());
        await page.waitForFunction(hooksReady, undefined, { timeout: 15_000 });

        const steps: Step[] = [];
        const held = new Set<string>();
        let played = 0;
        let lastState = "";
        let changedAt = 0;
        let stuckReported = false;

        const save = (label: string): string => {
          const file = join(outDir, `fuzz-${seed}-run${run}-${label}.json`);
          // Release anything still held so the replay ends cleanly, then let the scenario runner judge it.
          const replay: Step[] = [...steps, ...[...held].map((code) => ({ release: code }))];
          writeFileSync(
            file,
            `${JSON.stringify({ name: `fuzz ${seed} run ${run} (${label})`, ...(options.page ? { page: options.page } : {}), steps: replay }, null, 2)}\n`,
          );
          // Relative to the project root, so it reads well and works as an argument to `debuff scenario`.
          return relative(options.root, file).split("\\").join("/");
        };
        const advance = async (n: number): Promise<HookResult<unknown>> => {
          steps.push({ wait: n });
          played += n;
          return callSafe(page, "step", [n]);
        };

        while (played < budget) {
          // Mostly hold a movement key for a while, sometimes tap an action key, sometimes do nothing.
          const roll = random();
          const key = keys[Math.floor(random() * keys.length)] ?? "Space";
          let result: HookResult<unknown>;
          if (roll < 0.15) {
            result = await advance(1 + Math.floor(random() * 20));
          } else if (MOVE_KEYS.has(key) || roll < 0.35) {
            if (held.has(key)) {
              held.delete(key);
              steps.push({ release: key });
              await callSafe(page, "release", [key]);
            } else {
              held.add(key);
              steps.push({ press: key });
              await callSafe(page, "press", [key]);
            }
            result = await advance(6 + Math.floor(random() * 50));
          } else {
            steps.push({ press: key });
            await callSafe(page, "press", [key]);
            result = await advance(1 + Math.floor(random() * 4));
            steps.push({ release: key });
            await callSafe(page, "release", [key]);
          }

          if (!result.ok) {
            // Give the dev tools a moment to explain and source-map the error.
            await page.waitForTimeout(250);
            const explained = (await callSafe(page, "errors", [])) as HookResult<unknown[]>;
            const state = (await callSafe(page, "state", [])) as HookResult<{ tick: number }>;
            findings.push({
              kind: "error",
              run,
              tick: state.ok ? state.value.tick : played,
              message: result.error,
              ...(explained.ok && explained.value.length ? { error: explained.value.at(-1) } : {}),
              repro: save("error"),
            });
            break;
          }

          // Stuck: input keeps arriving but the scene's inspect() state hasn't changed for a long time.
          const state = (await callSafe(page, "state", [])) as HookResult<{ scene?: string; state?: unknown; tick: number }>;
          if (state.ok && state.value.state !== undefined && !stuckReported) {
            const now = JSON.stringify([state.value.scene, state.value.state]);
            if (now !== lastState) {
              lastState = now;
              changedAt = played;
            } else if (played - changedAt >= stuckSteps) {
              stuckReported = true;
              findings.push({
                kind: "stuck",
                run,
                tick: state.value.tick,
                message: `State unchanged for ${Math.round((played - changedAt) / 60)} s of input (scene "${state.value.scene ?? "?"}"). Possible softlock, or a screen that ignores these keys.`,
                repro: save("stuck"),
              });
            }
          }
        }
        totalSteps += played;
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const report: FuzzReport = { seed, runs, steps: totalSteps, findings, durationMs: Date.now() - started };
  writeFileSync(join(outDir, `fuzz-${seed}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
