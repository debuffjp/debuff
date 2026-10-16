#!/usr/bin/env node
import { runCreate } from "./interactive.js";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = args.find((a, i) => !a.startsWith("-") && !args[i - 1]?.startsWith("--"));

runCreate({ dir, template: flag("template"), yes: args.includes("--yes") || args.includes("-y") }).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
