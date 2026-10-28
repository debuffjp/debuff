// Validate every publishable package the way npm consumers will see it:
// publint (package.json/exports correctness) and attw (type resolution).
// Each call spends most of its time starting up and packing, so packages run in parallel.
import { exec, execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(process.platform === "win32" ? exec : execFile);
const dirs = ["packages", "tooling"].flatMap((group) => readdirSync(group).map((name) => join(group, name)));
const bin = (name) => join("node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);

async function lint(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  if (pkg.private) return true;
  for (const [tool, args] of [
    ["publint", ["run", dir, "--strict"]],
    ["attw", ["--pack", dir, "--profile", "esm-only", "--format", "table-flipped"]],
  ]) {
    try {
      // Windows runs the .cmd shims through a shell; one command string avoids Node's DEP0190 warning.
      if (process.platform === "win32") await run([bin(tool), ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" "));
      else await run(bin(tool), args);
    } catch (err) {
      console.error(`✖ ${pkg.name}: ${tool}\n${err.stdout ?? ""}${err.stderr ?? ""}`);
      return false;
    }
  }
  console.log(`✔ ${pkg.name}`);
  return true;
}

const queue = [...dirs];
const results = [];
const workers = Array.from({ length: Math.min(8, availableParallelism()) }, async () => {
  while (queue.length) results.push(await lint(queue.shift()));
});
await Promise.all(workers);
process.exit(results.every(Boolean) ? 0 : 1);
