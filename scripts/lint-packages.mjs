// Validate every publishable package the way npm consumers will see it:
// publint (package.json/exports correctness) and attw (type resolution).
import { execFileSync, execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dirs = ["packages", "tooling"].flatMap((group) => readdirSync(group).map((name) => join(group, name)));
const bin = (name) => join("node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
let failed = false;

for (const dir of dirs) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  if (pkg.private) continue;
  for (const [tool, args] of [
    ["publint", ["run", dir, "--strict"]],
    ["attw", ["--pack", dir, "--profile", "esm-only", "--format", "table-flipped"]],
  ]) {
    try {
      // Windows runs the .cmd shims through a shell; one command string avoids Node's DEP0190 warning.
      if (process.platform === "win32")
        execSync([bin(tool), ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" "), { stdio: "pipe" });
      else execFileSync(bin(tool), args, { stdio: "pipe" });
    } catch (err) {
      failed = true;
      console.error(`✖ ${pkg.name}: ${tool}\n${err.stdout ?? ""}${err.stderr ?? ""}`);
    }
  }
  if (!failed) console.log(`✔ ${pkg.name}`);
}
process.exit(failed ? 1 : 0);
