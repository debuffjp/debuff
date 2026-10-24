#!/usr/bin/env node
import { main } from "../dist-cli/main.js";

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`myaku: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  },
);
