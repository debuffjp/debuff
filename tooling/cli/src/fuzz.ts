import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Page } from "playwright-core";
import { loadConfig } from "./config.js";
import { hooksReady } from "./scenario/browser.js";
import { launchBrowser, VIEWPORT } from "./scenario/run.js";
import type { Step } from "./scenario/types.js";
import { createDevServer } from "./vite.js";

/**
 * Keys most small games use. Override with `keys`: KeyboardEvent.code values, `"PointerRight"` / `"PointerMiddle"` for
 * mouse buttons, or the gestures `"Wheel"` (a scroll) and `"Touch"` (a finger tap or drag somewhere on the game).
 */
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
/** Pseudo-keys that play a whole gesture instead of pressing a key. */
export const FUZZ_GESTURES = new Set(["Wheel", "Touch"]);
/** Steps between state samples while fuzzing; loops shorter than this can slip through. */
const SAMPLE_STEPS = 10;
/** A field flipping between the same two values this many times with input unchanged counts as a loop. */
const LOOP_FLIPS = 4;

export interface FuzzOptions {
  root: string;
  /** Simulated seconds of play per run (60 steps = 1 s). Default 60. */
  seconds?: number;
  /** Independent runs, each from a fresh page load. Default 3. */
  runs?: number;
  /** Seed for the input generator. Same seed, same inputs. Default: random. */
  seed?: number;
  /** Keys to press, plus the gestures `"Wheel"` and `"Touch"`. Default: arrows, WASD, Space, Enter, Z, X. */
  keys?: string[];
  /** Flag a run as stuck when the scene's inspect() state doesn't change for this many seconds. Default 15. */
  stuckSeconds?: number;
  /** Page to open. Default "/". */
  page?: string;
  /**
   * State paths the loop check skips, e.g. `["state.shots"]` for counters that rise and fall in normal play.
   * Fields that flip on their own are already ignored; use this for ones that flip together.
   */
  ignore?: string[];
}

/**
 * A loop is the game bouncing between the same two states with input unchanged: the scene flipping, or at least
 * two state fields flipping in step (a screen index and the player's position, say). One field flipping on its own
 * is normal play (a bullet count rising and falling), so it doesn't count. `flips` maps each path to the values it
 * took, in order, since input last changed.
 */
export function findLoop(flips: ReadonlyMap<string, readonly string[]>): { paths: string[]; values: [string, string] } | undefined {
  const flipping = [...flips].filter(([, seen]) => seen.length >= LOOP_FLIPS + 1 && new Set(seen.slice(-(LOOP_FLIPS + 1))).size === 2);
  const scene = flipping.find(([path]) => path === "scene");
  const found = scene ? [scene] : flipping.length >= 2 ? flipping : [];
  const first = found[0];
  if (!first) return undefined;
  return { paths: found.map(([path]) => path), values: [first[1].at(-2) ?? "", first[1].at(-1) ?? ""] };
}

export interface FuzzFinding {
  kind: "error" | "stuck" | "loop";
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
/**
 * One random gesture as scenario steps, waits included: a wheel scroll, or a finger that taps or drags within the
 * game's logical `width` × `height`. Steps that aren't waits are input for the dev hooks.
 */
export function fuzzGesture(name: string, random: () => number, width: number, height: number): Step[] {
  if (name === "Wheel") {
    const dy = Math.round((40 + random() * 360) * (random() < 0.5 ? -1 : 1));
    return [{ wheel: dy }, { wait: 1 + Math.floor(random() * 10) }];
  }
  const point = (): [number, number] => [Math.round(random() * width), Math.round(random() * height)];
  const [x, y] = point();
  const steps: Step[] = [{ touchDown: [1, x, y] }, { wait: 1 + Math.floor(random() * 4) }];
  // Half the time a drag: a few moves towards another point.
  if (random() < 0.5) {
    const [tx, ty] = point();
    const moves = 2 + Math.floor(random() * 4);
    for (let i = 1; i <= moves; i++) {
      steps.push({ touchMove: [1, Math.round(x + ((tx - x) * i) / moves), Math.round(y + ((ty - y) * i) / moves)] }, { wait: 2 });
    }
  }
  steps.push({ touchUp: 1 }, { wait: 1 + Math.floor(random() * 10) });
  return steps;
}

/** The dev hook and arguments that play a gesture's input step. */
function gestureCall(step: Step): [string, unknown[]] {
  if ("wheel" in step) return ["wheel", typeof step.wheel === "number" ? [step.wheel, 0] : step.wheel];
  if ("touchDown" in step) return ["touchDown", step.touchDown];
  if ("touchMove" in step) return ["touchMove", step.touchMove];
  if ("touchUp" in step) return ["touchUp", [step.touchUp]];
  throw new Error(`Not a gesture step: ${JSON.stringify(step)}`);
}

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
  // The project's scenario viewport, so a portrait game is fuzzed at its own shape.
  const [width, height] = (await loadConfig(options.root)).viewport ?? VIEWPORT;
  const findings: FuzzFinding[] = [];
  let totalSteps = 0;

  try {
    for (let run = 1; run <= runs; run++) {
      const random = rng(seed + run * 7919);
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      try {
        const url = new URL(options.page ?? "/", base);
        url.searchParams.set("debuff-scenario", "1");
        await page.goto(url.toString());
        await page.waitForFunction(hooksReady, undefined, { timeout: 15_000 });

        const steps: Step[] = [];
        // The game's logical size, for where gestures land.
        const shown = (await callSafe(page, "state", [])) as HookResult<{ width?: number; height?: number }>;
        const size = { width: (shown.ok && shown.value.width) || width, height: (shown.ok && shown.value.height) || height };
        const ignore = new Set(options.ignore ?? []);
        const held = new Set<string>();
        let played = 0;
        let lastState = "";
        let changedAt = 0;
        let stuckReported = false;
        let loopReported = false;
        // Loop detection: per top-level state field, the values it took since input last changed.
        let flips = new Map<string, string[]>();
        const inputChanged = () => {
          flips = new Map();
        };

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
        /** Bouncing back and forth between two values with input unchanged, e.g. a door or stairs that send you straight back. */
        const checkLoop = (state: { scene?: string; state?: unknown; tick: number }) => {
          if (loopReported || held.size === 0) return;
          const fields: [string, unknown][] = [["scene", state.scene]];
          if (state.state && typeof state.state === "object")
            fields.push(...Object.entries(state.state).map(([k, v]): [string, unknown] => [`state.${k}`, v]));
          for (const [path, value] of fields) {
            // true/false phase flags (scrolling, attacking) flip all the time in normal play.
            if (typeof value === "boolean" || ignore.has(path)) continue;
            const json = JSON.stringify(value) ?? "undefined";
            const seen = flips.get(path) ?? [];
            if (seen.at(-1) !== json) seen.push(json);
            flips.set(path, seen);
          }
          const loop = findLoop(flips);
          if (!loop) return;
          loopReported = true;
          findings.push({
            kind: "loop",
            run,
            tick: state.tick,
            message: `${loop.paths.join(" and ")} kept flipping between the same two states while ${[...held].join("+")} stayed held (${loop.paths[0]}: ${loop.values[0]} ⇄ ${loop.values[1]}). Possible loop (e.g. a door or stairs that send the player straight back).`,
            repro: save("loop"),
          });
        };
        const advance = async (n: number): Promise<HookResult<unknown>> => {
          // Step in short chunks so loops shorter than one hold are seen.
          let result: HookResult<unknown> = { ok: true, value: undefined };
          for (let left = n; left > 0 && result.ok; left -= SAMPLE_STEPS) {
            const chunk = Math.min(SAMPLE_STEPS, left);
            steps.push({ wait: chunk });
            played += chunk;
            result = await callSafe(page, "step", [chunk]);
            const value = result.ok ? (result.value as { scene?: string; state?: unknown; tick: number } | undefined) : undefined;
            if (value && typeof value.tick === "number") checkLoop(value);
          }
          return result;
        };

        while (played < budget) {
          // Mostly hold a movement key for a while, sometimes tap an action key, sometimes do nothing.
          const roll = random();
          const key = keys[Math.floor(random() * keys.length)] ?? "Space";
          let result: HookResult<unknown>;
          if (roll < 0.15) {
            result = await advance(1 + Math.floor(random() * 20));
          } else if (FUZZ_GESTURES.has(key)) {
            inputChanged();
            result = { ok: true, value: undefined };
            for (const step of fuzzGesture(key, random, size.width, size.height)) {
              if ("wait" in step) result = await advance(step.wait);
              else {
                steps.push(step);
                const [hook, args] = gestureCall(step);
                await callSafe(page, hook, args);
              }
              if (!result.ok) break;
            }
            inputChanged();
          } else if (MOVE_KEYS.has(key) || roll < 0.35) {
            inputChanged();
            if (held.has(key)) {
              held.delete(key);
              steps.push({ release: key });
              await callSafe(page, "release", [key]);
            } else {
              held.add(key);
              steps.push({ press: key });
              await callSafe(page, "press", [key]);
            }
            // Mostly short holds; sometimes a long one, which is what walks into loops and softlocks.
            result = await advance(random() < 0.1 ? 120 + Math.floor(random() * 180) : 6 + Math.floor(random() * 50));
          } else {
            inputChanged();
            steps.push({ press: key });
            await callSafe(page, "press", [key]);
            result = await advance(1 + Math.floor(random() * 4));
            steps.push({ release: key });
            await callSafe(page, "release", [key]);
            inputChanged();
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
