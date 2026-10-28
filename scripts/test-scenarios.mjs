// Run every template's logic tests and scenarios, a few templates at a time. Each template's dev server
// takes the next free port (Vite's strictPort: false). Output is printed per template once it finishes.
import { exec } from "node:child_process";
import { readdirSync } from "node:fs";
import { promisify } from "node:util";

const run = promisify(exec);
const queue = readdirSync("templates");
let failed = false;

async function test(name) {
  try {
    const { stdout, stderr } = await run(`npm test -w templates/${name}`, { maxBuffer: 64 * 1024 * 1024 });
    console.log(`✔ templates/${name}\n${stdout}${stderr}`);
  } catch (err) {
    failed = true;
    console.error(`✖ templates/${name}\n${err.stdout ?? ""}${err.stderr ?? ""}`);
  }
}

await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) await test(queue.shift());
  }),
);
process.exit(failed ? 1 : 0);
