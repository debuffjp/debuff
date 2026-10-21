import { resolve } from "node:path";
import { parseArgs } from "node:util";
import pc from "./ansi.js";
import { init } from "./init.js";
import { findTests, formatResult, formatSummary, runTests } from "./runner.js";

const HELP = `keiko: fast, deterministic tests for web games

Usage:
  keiko [files...] [options]
  keiko init            Write a first test for your game, for the engine it uses

Runs tests/**/*.test.ts (and src/**/*.test.ts) against your real game in Node, with no browser.

Options:
  -t, --filter <text>   Only run tests whose full name contains this text
                        (case-insensitive substring, not a regex)
      --root <dir>      Project root (default: the current folder)
      --json            Print a machine-readable report
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
      debuff: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const root = resolve(values.root ?? process.cwd());
  if (positionals[0] === "init") return init(root);
  if (!findTests(root, positionals).length) {
    if (values.json)
      console.log(JSON.stringify({ ok: true, passed: 0, failed: 0, skipped: 0, todo: 0, durationMs: 0, results: [], outside: [] }));
    else
      console.log(
        `No tests yet. Write a first one with ${pc.cyan("npx keiko init")}, or add one in tests/.\nGuide: ${pc.cyan("https://debuff.jp/docs/testing")}`,
      );
    return 0;
  }
  if (!values.json) console.log(`\n${pc.bold("keiko")} ${pc.dim("稽古 · practice for web games")}\n`);
  const report = await runTests({
    root,
    files: positionals,
    ...(values.filter ? { filter: values.filter } : {}),
    ...(values.debuff === undefined ? {} : { debuff: values.debuff }),
    ...(values.json ? {} : { onResult: (r) => console.log(formatResult(r)) }),
  });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(`\n${report.ok ? pc.green("✔") : pc.red("✖")} ${formatSummary(report)}\n`);
  return report.ok ? 0 : 1;
}
