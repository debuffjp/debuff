/**
 * henka (変化, "change"): tests for your tests. It breaks the code under test one small change at a time and checks that a test fails each time.
 * henka runs nothing itself: an adapter runs your tests clean, lists mutants, then runs them again with
 * each mutant applied. keiko ships an adapter for web games (`npx keiko mutate`).
 *
 * ```ts
 * import { formatReport, mutate, writeOut } from "henka";
 *
 * const report = await mutate(myAdapter);
 * writeOut(report, "mutants.out");
 * console.log(formatReport(report));
 * ```
 *
 * @packageDocumentation
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What a passing suite should do under a mutant. `"noticed"`: some test should fail (a param pushed to the
 * end of its range). `"ignored"`: every test should still pass (a different random seed or frame rate).
 */
export type Expectation = "noticed" | "ignored";

/** One change to try. The adapter knows how to apply it; henka only needs to tell mutants apart. */
export interface Mutant {
  /** Stable across runs, e.g. `param:player.speed=0`. */
  id: string;
  /** What changed, in words: `player.speed 140 → 0`. */
  label: string;
  expect: Expectation;
}

/** A test run: which tests failed, by full name. */
export interface RunResult {
  failed: string[];
  passed: number;
  durationMs: number;
  /** Anything the reader should know about this run, such as "no test loads this file". */
  note?: string;
}

/** How a mutant run ended: a run, or why the mutant couldn't be applied. */
export type MutantRun = RunResult | { unviable: string };

/** Runs a project's tests for henka. */
export interface Adapter {
  /** Shown in reports, e.g. `keiko`. */
  name: string;
  /** Run every test with nothing changed. henka stops if any fail: a mutant can't be judged against a red suite. */
  baseline(): Promise<RunResult>;
  /** The mutants to try. Called after the baseline, so an adapter can list what the baseline saw. */
  mutants(): Promise<Mutant[]> | Mutant[];
  /** Run the tests with one mutant applied. */
  run(mutant: Mutant): Promise<MutantRun>;
  /** Called once when henka is done with the adapter, after the last run or a failure. */
  close?(): Promise<void>;
}

/**
 * - `caught`: a `"noticed"` mutant made a test fail. Good.
 * - `missed`: a `"noticed"` mutant passed every test, so nothing tests what it changed.
 * - `held`: an `"ignored"` mutant passed every test. Good.
 * - `brittle`: an `"ignored"` mutant made a test fail: the test, or the game, depends on something it shouldn't.
 * - `unviable`: the mutant couldn't be applied.
 */
export type Outcome = "caught" | "missed" | "held" | "brittle" | "unviable";

export interface MutantOutcome {
  mutant: Mutant;
  outcome: Outcome;
  /** Tests that failed with the mutant applied. */
  failed: string[];
  durationMs: number;
  /** Why an unviable mutant couldn't be applied, or the run's note. */
  reason?: string;
}

export interface Report {
  adapter: string;
  baseline: RunResult;
  outcomes: MutantOutcome[];
  counts: Record<Outcome, number>;
  /** False when any mutant was missed or brittle. */
  ok: boolean;
}

/** Thrown when the baseline run has failing tests. */
export class BaselineError extends Error {
  override readonly name = "BaselineError";
  constructor(readonly failed: string[]) {
    super(
      `${failed.length} test${failed.length === 1 ? "" : "s"} failed with nothing changed, so mutants can't be judged. ` +
        `Fix these first: ${failed.join("; ")}`,
    );
  }
}

function judge(expect: Expectation, anyFailed: boolean): Outcome {
  if (expect === "noticed") return anyFailed ? "caught" : "missed";
  return anyFailed ? "brittle" : "held";
}

export interface MutateOptions {
  /** Called as each mutant finishes, for live output. */
  onOutcome?: (outcome: MutantOutcome) => void;
  /** Mutants to run at once. Only for adapters whose runs don't share state. Default 1. */
  jobs?: number;
}

/** Run the baseline, then every mutant. Never throws for a missed mutant; check `report.ok`. Outcomes keep the adapter's order. */
export async function mutate(adapter: Adapter, options: MutateOptions = {}): Promise<Report> {
  try {
    return await mutateWith(adapter, options);
  } finally {
    await adapter.close?.();
  }
}

async function mutateWith(adapter: Adapter, options: MutateOptions): Promise<Report> {
  const baseline = await adapter.baseline();
  if (baseline.failed.length) throw new BaselineError(baseline.failed);
  const mutants = await adapter.mutants();
  const seen = new Set<string>();
  for (const { id } of mutants) {
    if (seen.has(id)) throw new Error(`${adapter.name} listed mutant ${id} twice`);
    seen.add(id);
  }
  const outcomes: MutantOutcome[] = new Array(mutants.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < mutants.length; i = next++) {
      const mutant = mutants[i] as Mutant;
      const run = await adapter.run(mutant);
      const outcome: MutantOutcome =
        "unviable" in run
          ? { mutant, outcome: "unviable", failed: [], durationMs: 0, reason: run.unviable }
          : {
              mutant,
              outcome: judge(mutant.expect, run.failed.length > 0),
              failed: run.failed,
              durationMs: run.durationMs,
              ...(run.note ? { reason: run.note } : {}),
            };
      outcomes[i] = outcome;
      options.onOutcome?.(outcome);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.jobs ?? 1, mutants.length)) }, worker));
  const counts: Record<Outcome, number> = { caught: 0, missed: 0, held: 0, brittle: 0, unviable: 0 };
  for (const o of outcomes) counts[o.outcome]++;
  return { adapter: adapter.name, baseline, outcomes, counts, ok: counts.missed + counts.brittle === 0 };
}

/**
 * Write a report as a folder agents and CI can read: `outcomes.json`, plus one `<outcome>.txt` per outcome
 * with a mutant per line. Replaces what was there.
 */
export function writeOut(report: Report, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "outcomes.json"), `${JSON.stringify(report, null, 2)}\n`);
  for (const outcome of Object.keys(report.counts) as Outcome[]) {
    const lines = report.outcomes.filter((o) => o.outcome === outcome).map(line);
    writeFileSync(join(dir, `${outcome}.txt`), lines.length ? `${lines.join("\n")}\n` : "");
  }
}

function line(o: MutantOutcome): string {
  if (o.reason) return `${o.mutant.label}: ${o.reason}`;
  return o.failed.length ? `${o.mutant.label} (failed: ${o.failed.join("; ")})` : o.mutant.label;
}

const ADVICE: Partial<Record<Outcome, string>> = {
  missed:
    "no test failed, so nothing tests what these change. Assert on the behaviour they control in the test that runs this code, or add a test if none does.",
  brittle: "tests failed under a change they should shrug off. Assert on outcomes, not on exact random draws or frame counts.",
};

/** A short plain-text summary: counts, then each missed and brittle mutant with what to do. */
export function formatReport(report: Report): string {
  const c = report.counts;
  const lines = [
    `${report.outcomes.length} mutants: ${c.caught} caught, ${c.missed} missed, ${c.held} held, ${c.brittle} brittle, ${c.unviable} unviable`,
  ];
  for (const outcome of ["missed", "brittle"] as const) {
    const list = report.outcomes.filter((o) => o.outcome === outcome);
    if (!list.length) continue;
    lines.push("", `${outcome}: ${ADVICE[outcome]}`, ...list.map((o) => `  ${line(o)}`));
  }
  return lines.join("\n");
}
