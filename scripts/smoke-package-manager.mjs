// End-to-end check that a scaffolded game installs and builds with a given package manager,
// using locally packed tarballs instead of the registry.
//
//   node scripts/smoke-package-manager.mjs <npm|pnpm|yarn|bun> [--scenarios]
//
// Run `npm run build` first.
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const pm = process.argv[2];
const scenarios = process.argv.includes("--scenarios");
if (!["npm", "pnpm", "yarn", "bun"].includes(pm)) {
  console.error("Usage: smoke-package-manager.mjs <npm|pnpm|yarn|bun> [--scenarios]");
  process.exit(2);
}

const repo = resolve(import.meta.dirname, "..");
const work = mkdtempSync(join(tmpdir(), `debuff-smoke-${pm}-`));
const tarballs = join(work, "tarballs");
mkdirSync(tarballs);

const run = (cmd, args, cwd) => {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  // A single command string: Windows package managers are .cmd shims that need a shell, and every argument here is ours.
  execSync([cmd, ...args.map((a) => JSON.stringify(a))].join(" "), { cwd, stdio: "inherit", env: { ...process.env, CI: "true" } });
};

// 1. Pack every publishable workspace (runs prepack, so create-debuff bundles its templates).
const dirs = ["packages", "tooling"].flatMap((g) => readdirSync(join(repo, g)).map((n) => join(repo, g, n)));
const files = {};
for (const dir of dirs) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  if (pkg.private) continue;
  const out = execSync(`npm pack --json --pack-destination ${JSON.stringify(tarballs)}`, { cwd: dir, encoding: "utf8" });
  const [{ filename }] = JSON.parse(out.slice(out.indexOf("[")));
  files[pkg.name] = `file:${join(tarballs, filename).replaceAll("\\", "/")}`;
}

// 2. Scaffold with the packed create-debuff, exactly as `npm create debuff` would.
const game = join(work, "game");
run("node", [join(repo, "tooling/create-debuff/bin/create-debuff.js"), game, "--yes"], work);

// 3. Point every @debuff/* dependency, direct and transitive, at the tarballs.
const pkgPath = join(game, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
for (const field of ["dependencies", "devDependencies"]) {
  for (const name of Object.keys(pkg[field] ?? {})) if (files[name]) pkg[field][name] = files[name];
}
if (pm === "pnpm") {
  // pnpm 10+ reads overrides from pnpm-workspace.yaml.
  const lines = Object.entries(files).map(([name, spec]) => `  "${name}": "${spec}"`);
  writeFileSync(join(game, "pnpm-workspace.yaml"), ["overrides:", ...lines, ""].join("\n"));
} else if (pm === "yarn") pkg.resolutions = files;
else pkg.overrides = files;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
if (pm === "yarn") writeFileSync(join(game, ".yarnrc.yml"), "nodeLinker: node-modules\nenableImmutableInstalls: false\n");

// 4. Install, typecheck and build with the chosen package manager.
run(pm, ["install"], game);
run(pm, ["run", "build"], game);
if (scenarios) run(pm, ["run", "test"], game);
console.log(`\n✔ ${pm}: scaffold, install and build succeeded in ${game}`);
