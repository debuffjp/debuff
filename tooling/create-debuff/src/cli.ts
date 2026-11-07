#!/usr/bin/env node
import { parseArgs } from "./args.js";
import { runCreate } from "./interactive.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm create debuff@latest [dir] [options]

Scaffold a new debuff game in [dir] (prompts for it when omitted).

Options:
  --template <id>  Template to use (prompts when omitted)
  -y, --yes        Accept defaults without prompting
  --no-git         Don't start a git repository with a first commit
  --no-credit      Leave debuff out of the first commit's co-authors
  --color          Force coloured output
  --no-color       Disable coloured output
  -h, --help       Show this help`);
  process.exit(0);
}
runCreate(parseArgs(args)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
