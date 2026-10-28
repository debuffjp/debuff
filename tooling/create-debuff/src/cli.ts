#!/usr/bin/env node
import { runCreate } from "./interactive.js";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm create debuff@latest [dir] [options]

Scaffold a new debuff game in [dir] (prompts for it when omitted).

Options:
  --template <id>  Template to use (prompts when omitted)
  -y, --yes        Accept defaults without prompting
  --no-git         Don't start a git repository with a first commit
  --color          Force coloured output
  --no-color       Disable coloured output
  -h, --help       Show this help`);
  process.exit(0);
}
const dir = args.find((a, i) => !a.startsWith("-") && !args[i - 1]?.startsWith("--"));

runCreate({ dir, template: flag("template"), yes: args.includes("--yes") || args.includes("-y"), git: !args.includes("--no-git") }).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
