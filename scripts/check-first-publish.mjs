// Lists public workspace packages that aren't on npm yet. CI publishes with npm trusted publishing (OIDC),
// which can't create a package: a new one needs its first version published locally (docs/releasing.md).
// Without that, every Release run fails with E404 at `changeset publish`, as henka did eight times.
//
//   node scripts/check-first-publish.mjs          exits 1 when any is missing (Release runs it before publishing)
//   node scripts/check-first-publish.mjs --warn   only prints GitHub warnings (CI runs it on pull requests)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const warnOnly = process.argv.includes("--warn");
const workspaces = JSON.parse(readFileSync("package.json", "utf8")).workspaces;
const names = [];
for (const pattern of workspaces) {
  const base = pattern.replace(/\/\*$/, "");
  if (!existsSync(base)) continue;
  for (const dir of readdirSync(base)) {
    const file = join(base, dir, "package.json");
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    if (!pkg.private && pkg.name) names.push(pkg.name);
  }
}

/** True when npm has the package (any version), false on a 404, undefined when npm couldn't be asked. */
function onNpm(name) {
  try {
    execFileSync("npm", ["view", name, "name", "--prefer-online"], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    return true;
  } catch (error) {
    return /E404|404 Not Found|is not in this registry/i.test(String(error.stderr ?? error.message)) ? false : undefined;
  }
}

const missing = [];
for (const name of names) {
  const found = onNpm(name);
  if (found === false) missing.push(name);
  else if (found === undefined) console.log(`::warning::couldn't ask npm about ${name}; not checked`);
}
if (!missing.length) {
  console.log(`all ${names.length} public packages are on npm`);
  process.exit(0);
}
const level = warnOnly ? "warning" : "error";
for (const name of missing)
  console.log(
    `::${level}::${name} isn't on npm yet, and trusted publishing can't create it. Publish its first version locally (npm login, then npm run release), then add its trusted publisher on npmjs.com. See docs/releasing.md.`,
  );
process.exit(warnOnly ? 0 : 1);
