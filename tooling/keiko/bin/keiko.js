#!/usr/bin/env node
import { main } from "../dist/cli.js";

// Set the exit code and let Node exit once the dev server and pages have closed;
// process.exit() mid-shutdown can trip a libuv assertion on Windows.
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  },
);
