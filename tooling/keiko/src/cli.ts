import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { BaselineError, formatReport, mutate, type Outcome, type Report, writeOut } from "henka";
import pc from "./ansi.js";
import { init } from "./init.js";
import { keikoAdapter } from "./mutate.js";
import { findTests, formatResult, formatSummary, type RunTestsOptions, runTests } from "./runner.js";

const HELP = `keiko: fast, deterministic tests for web games

Usage:
  keiko [files...] [options]
  keiko init            Write a first test for your game, for the engine it uses
  keiko mutate [files...]
                        Test your tests: push each param to the end of
                        its range (a test should fail), change the random seed and the
                        frame rate (no test should). Writes mutants.out/

Runs tests/**/*.test.ts (and src/**/*.test.ts) against your real game in Node, with no browser.

Options:
  -t, --filter <text>   Only run tests whose full name contains this text
                        (case-insensitive substring, not a regex)
      --changed         Only run tests whose code or files changed since they
                        last passed, plus new and failed ones. Every run
                        records what each test used, so this compares with
                        the last run in the same queue
      --queue <name>    The queue to record into and compare with (default:
                        "default"). Give each loop its own: --queue push in a
                        pre-push hook still runs everything changed since the
                        last push, whatever ran in between
      --root <dir>      Project root (default: the current folder)
      --json            Print a machine-readable report
      --out <dir>       Where keiko mutate writes its results (default: mutants.out)
      --debuff          Drive the game through debuff's dev hooks (default: detected)
      --no-debuff       Drive the game through window.__KEIKO__ and the virtual clock
  -h, --help            Show this help

Docs: https://github.com/debuffjp/debuff/tree/main/tooling/keiko#readme`;

/** `npx keiko`: run a project's tests and exit with 1 if any failed. */
export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      filter: { type: "string", short: "t" },
      root: { type: "string" },
      json: { type: "boolean" },
      out: { type: "string" },
      debuff: { type: "boolean" },
      changed: { type: "boolean" },
      queue: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const root = resolve(values.root ?? process.cwd());
  if (positionals[0] === "init") return init(root);
  const mutating = positionals[0] === "mutate";
  const files = mutating ? positionals.slice(1) : positionals;
  if (!findTests(root, files).length) {
    if (values.json)
      console.log(JSON.stringify({ ok: true, passed: 0, failed: 0, skipped: 0, todo: 0, durationMs: 0, results: [], outside: [] }));
    else
      console.log(
        `No tests yet. Write a first one with ${pc.cyan("npx keiko init")}, or add one in tests/.\nGuide: ${pc.cyan("https://debuff.jp/docs/testing")}`,
      );
    return 0;
  }
  if (!values.json) console.log(`\n${pc.bold("keiko")} ${pc.dim("稽古 · practice for web games")}\n`);
  const options = {
    root,
    files,
    ...(values.filter ? { filter: values.filter } : {}),
    ...(values.debuff === undefined ? {} : { debuff: values.debuff }),
  };
  // Every run records into its queue (it costs a few percent), so `--changed` always has the last run to compare with.
  const impact = { queue: values.queue ?? "default", ...(values.changed ? { changed: true } : {}) };
  if (mutating) return mutateCommand(options, resolve(root, values.out ?? "mutants.out"), values.json ?? false);
  const report = await runTests({ ...options, ...impact, ...(values.json ? {} : { onResult: (r) => console.log(formatResult(r)) }) });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(`\n${report.ok ? pc.green("✔") : pc.red("✖")} ${formatSummary(report)}\n`);
  return report.ok ? 0 : 1;
}

const MARK: Record<Outcome, string> = {
  caught: pc.green("✔ caught  "),
  held: pc.green("✔ held    "),
  missed: pc.red("✖ missed  "),
  brittle: pc.red("✖ brittle "),
  unviable: pc.dim("- unviable"),
};

/** `keiko mutate`: exit 1 when a mutant was missed or brittle, or the tests fail with nothing changed. */
async function mutateCommand(options: RunTestsOptions, out: string, json: boolean): Promise<number> {
  if (!json) console.log(pc.dim("Running the tests with nothing changed first…"));
  let report: Report;
  try {
    report = await mutate(keikoAdapter(options), json ? {} : { onOutcome: (o) => console.log(`${MARK[o.outcome]} ${o.mutant.label}`) });
  } catch (err) {
    if (!(err instanceof BaselineError)) throw err;
    if (json) console.log(JSON.stringify({ ok: false, error: err.message, failed: err.failed }, null, 2));
    else console.log(`\n${pc.red("✖")} ${err.message}\n`);
    return 1;
  }
  writeOut(report, out);
  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log(`\n${formatReport(report)}\n\n${pc.dim(`Written to ${out}`)}\n`);
  return report.ok ? 0 : 1;
}
