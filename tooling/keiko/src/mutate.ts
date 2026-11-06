/**
 * `keiko mutate`: a henka adapter that changes the game, not its code. Each mutant pushes one param to the
 * end of its range (some test should notice), or changes the random seed or frame rate (no test should).
 *
 * @module
 */
import type { Adapter, Mutant, MutantRun, RunResult } from "henka";
import type { ParamValue, Playtest } from "./playtest.js";
import { type Mutation, MutationError, type RunTestsOptions, runTests, type TestReport } from "./runner.js";

/** What the baseline saw of the game: how it's driven and its params, with ranges where the game declares them. */
interface Seen {
  kind: Playtest["driver"]["kind"];
  /** The game steps itself (`__KEIKO__.step`), so the clock's frame rate doesn't reach it. */
  ownStep: boolean;
  params: Map<string, { value: ParamValue; min?: number; max?: number }>;
}

/** Added to the seed: a prime, so the sequence shares nothing with the default seed. */
const SEED_OFFSET = 7919;
const SLOW_FPS = 30;

/** A henka adapter that runs a project's keiko tests. `options` are {@link runTests}'s. */
export function keikoAdapter(options: RunTestsOptions): Adapter {
  let seen: Seen | undefined;
  const plan = new Map<string, Mutation | { unviable: string }>();
  return {
    name: "keiko",
    async baseline() {
      const onBoot = (game: Playtest) => {
        seen ??= probe(game);
      };
      return result(await runTests({ ...options, onBoot }));
    },
    mutants() {
      if (!seen) throw new Error("No test booted a game, so keiko has nothing to change. Add a test that calls play().");
      const out: Mutant[] = [];
      const add = (mutant: Mutant, change: Mutation | { unviable: string }) => {
        out.push(mutant);
        plan.set(mutant.id, change);
      };
      for (const [path, { value, min, max }] of seen.params) {
        if (typeof value === "string") {
          add(
            { id: `param:${path}`, label: `${path} (text)`, expect: "noticed" },
            { unviable: "keiko mutate doesn't change text params yet" },
          );
          continue;
        }
        for (const to of variants(value, min, max)) {
          add({ id: `param:${path}=${to}`, label: `${path} ${value} → ${to}`, expect: "noticed" }, { params: { [path]: to } });
        }
      }
      const debuff = seen.kind === "debuff";
      add(
        { id: "seed", label: `Math.random() seed +${SEED_OFFSET}`, expect: "ignored" },
        debuff ? { unviable: "debuff games seed their own generator (game.random), not Math.random()" } : { seedOffset: SEED_OFFSET },
      );
      add(
        { id: `fps:${SLOW_FPS}`, label: `${SLOW_FPS} fps instead of 60`, expect: "ignored" },
        debuff || seen.ownStep
          ? { unviable: "the game steps on its own fixed time step, so the frame rate doesn't reach it" }
          : { fps: SLOW_FPS },
      );
      return out;
    },
    async run(mutant): Promise<MutantRun> {
      const change = plan.get(mutant.id);
      if (!change) throw new Error(`keiko didn't list mutant ${mutant.id}`);
      if ("unviable" in change) return change;
      const report = await runTests({ ...options, mutation: change });
      const refused = report.results.find((r) => r.error?.kind === MutationError.name);
      return refused?.error ? { unviable: `the game refused it: ${refused.error.message}` } : result(report);
    },
  };
}

function probe(game: Playtest): Seen {
  const w = game.window as Window & {
    __DEBUFF_DEV__?: { params(): Record<string, { schema?: Record<string, { min?: number; max?: number }> }> };
    __KEIKO__?: { step?: unknown };
  };
  const params: Seen["params"] = new Map();
  let groups: Record<string, Record<string, ParamValue>> = {};
  try {
    groups = game.driver.params();
  } catch {
    // The game has no params hook; seed and frame rate still apply.
  }
  const schema = game.driver.kind === "debuff" ? w.__DEBUFF_DEV__?.params() : undefined;
  for (const [group, values] of Object.entries(groups)) {
    for (const [key, value] of Object.entries(values)) {
      const spec = schema?.[group]?.schema?.[key];
      params.set(`${group}.${key}`, {
        value,
        ...(spec?.min === undefined ? {} : { min: spec.min }),
        ...(spec?.max === undefined ? {} : { max: spec.max }),
      });
    }
  }
  return { kind: game.driver.kind, ownStep: typeof w.__KEIKO__?.step === "function", params };
}

/** Values to try for a param: a number goes to each end of its range (0 and double without one), a boolean flips. */
export function variants(value: number | boolean, min?: number, max?: number): (number | boolean)[] {
  if (typeof value === "boolean") return [!value];
  const low = min ?? 0;
  const high = max ?? (value === 0 ? 1 : value * 2);
  return [...new Set([low, high])].filter((v) => v !== value);
}

function result(report: TestReport): RunResult {
  const failed = report.results.filter((r) => r.status === "fail").map((r) => r.fullName);
  // An error outside any test fails the run, so it counts as a failure the mutant caused.
  if (report.outside.length) failed.push(`(outside a test) ${report.outside[0]?.message}`);
  return { failed, passed: report.passed, durationMs: report.durationMs };
}
