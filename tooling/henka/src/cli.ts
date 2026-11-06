/**
 * `npx henka`: source mutants in a Vitest project.
 *
 * @module
 */
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { parseArgs, styleText } from "node:util";
import { BaselineError, formatReport, mutate, type Outcome, type Report, writeOut } from "./index.js";
import { vitestAdapter } from "./vitest.js";

const HELP = `henka [paths...]  Change your code one small edit at a time and check that a Vitest test fails.

  paths            files or folders to mutate (default: src)
  --since <ref>    only mutate lines changed since a git ref (main, HEAD)
  --jobs <n>       mutants to run at once (default: half the cores, at most 4)
  --timeout <s>    a run longer than this counts as caught (default: 5x the baseline, at least 20)
  --root <dir>     project root, where Vitest finds its config (default: .)
  --out <dir>      where to write the results (default: mutants.out)
  --list           print the mutants and stop
  --json           print the report as JSON

Exit code 1 when a mutant was missed or the tests fail with nothing changed.
Put // henka-skip above a line to leave it alone, or // henka-skip-file anywhere in a file.`;

const MARK: Record<Outcome, string> = {
  caught: styleText("green", "✔ caught  "),
  held: styleText("green", "✔ held    "),
  missed: styleText("red", "✖ missed  "),
  brittle: styleText("red", "✖ brittle "),
  unviable: styleText("dim", "- unviable"),
};

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      since: { type: "string" },
      jobs: { type: "string" },
      timeout: { type: "string" },
      root: { type: "string" },
      out: { type: "string" },
      list: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const root = resolve(values.root ?? ".");
  const jobs = values.jobs ? positive("--jobs", values.jobs) : Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
  const adapter = vitestAdapter({
    root,
    ...(positionals.length ? { paths: positionals } : {}),
    ...(values.since ? { since: values.since } : {}),
    ...(values.timeout ? { timeoutMs: positive("--timeout", values.timeout) * 1000 } : {}),
  });
  if (values.list) {
    const mutants = await adapter.mutants();
    if (values.json) console.log(JSON.stringify(mutants, null, 2));
    else console.log(`${mutants.map((m) => m.label).join("\n")}\n\n${mutants.length} mutants`);
    return 0;
  }
  const json = values.json ?? false;
  if (!json) console.log(styleText("dim", `Running the tests with nothing changed first, then each mutant (${jobs} at once)…`));
  let report: Report;
  try {
    report = await mutate(adapter, { jobs, ...(json ? {} : { onOutcome: (o) => console.log(`${MARK[o.outcome]} ${o.mutant.label}`) }) });
  } catch (err) {
    if (!(err instanceof BaselineError)) throw err;
    if (json) console.log(JSON.stringify({ ok: false, error: err.message, failed: err.failed }, null, 2));
    else console.log(`\n${styleText("red", "✖")} ${err.message}\n`);
    return 1;
  }
  const out = resolve(root, values.out ?? "mutants.out");
  writeOut(report, out);
  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log(`\n${formatReport(report)}\n\n${styleText("dim", `Written to ${out}`)}\n`);
  return report.ok ? 0 : 1;
}

function positive(flag: string, value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`henka: ${flag} needs a positive number, got ${value}`);
  return n;
}
