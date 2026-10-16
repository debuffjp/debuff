#!/usr/bin/env node
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAssets, findUnused } from "./assets.js";
import { buildReport, formatReport } from "./report.js";

const HELP = `debuff <command> [options]

Commands:
  create <dir>      Scaffold a new game from the starter template
  dev               Start the dev server with hot reload
  build             Production build + size report (fails on dev-code leaks)
  assets            Regenerate public/assets/manifest.json and list unused assets
  report            Print size report for an existing build
  scenario [files]  Run scenarios/*.json in a headless browser (--update to accept captures)
  inspect           Print a JSON summary of the project for agents and tools

Options:
  --root <dir>      Project root (default: current directory)
  --json            Machine-readable output where supported
`;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--root"));
const command = positional[0];
const root = resolve(option("root") ?? process.cwd());

async function main(): Promise<number> {
  switch (command) {
    case "create":
      return create(positional[1]);
    case "dev":
      return dev();
    case "build":
      return build();
    case "assets":
      return assets();
    case "report":
      return report();
    case "scenario":
      return scenario();
    case "inspect":
      return inspect();
    case undefined:
    case "help":
    case "--help":
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command "${command}".\n\n${HELP}`);
      return 1;
  }
}

function create(target: string | undefined): number {
  if (!target) {
    console.error("Usage: debuff create <dir>");
    return 1;
  }
  const dest = resolve(target);
  if (existsSync(dest) && readdirSync(dest).length > 0) {
    console.error(`${dest} exists and is not empty.`);
    return 1;
  }
  const template = join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "basic");
  cpSync(template, dest, { recursive: true });
  // npm strips .gitignore from published packages, so the template ships it without the dot.
  if (existsSync(join(dest, "gitignore"))) renameSync(join(dest, "gitignore"), join(dest, ".gitignore"));
  const pkgPath = join(dest, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name: string };
  pkg.name = basename(dest).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`Created ${pkg.name} in ${dest}\n\nNext:\n  cd ${target}\n  npm install\n  npx debuff dev`);
  return 0;
}

async function viteConfig() {
  const { debuff } = await import("./vite-plugin.js");
  const hasConfig = ["vite.config.ts", "vite.config.js", "vite.config.mjs"].some((f) => existsSync(join(root, f)));
  return { root, ...(hasConfig ? {} : { configFile: false as const }), plugins: [debuff()] };
}

async function dev(): Promise<number> {
  const { createServer } = await import("vite");
  const server = await createServer(await viteConfig());
  await server.listen();
  server.printUrls();
  return new Promise(() => {}); // run until killed
}

async function build(): Promise<number> {
  const { build: viteBuild } = await import("vite");
  await viteBuild({ ...(await viteConfig()), logLevel: "warn" });
  return report();
}

function report(): number {
  const r = buildReport(join(root, "dist"));
  console.log(flag("json") ? JSON.stringify(r, null, 2) : formatReport(r));
  writeFileSync(join(root, "dist", "debuff-report.json"), JSON.stringify(r, null, 2) + "\n");
  return r.leaks.length ? 1 : 0;
}

function assets(): number {
  const { manifest, warnings, path } = compileAssets(root);
  const unused = findUnused(root, manifest);
  if (flag("json")) {
    console.log(JSON.stringify({ path, count: Object.keys(manifest.assets).length, warnings, unused }, null, 2));
    return 0;
  }
  console.log(`Wrote ${path} (${Object.keys(manifest.assets).length} assets)`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (unused.length) console.log(`Possibly unused (not referenced by id in src/): ${unused.join(", ")}`);
  return 0;
}

async function scenario(): Promise<number> {
  const { runScenarios, formatScenario } = await import("./scenario.js");
  const reports = await runScenarios({ root, files: positional.slice(1), update: flag("update") });
  if (flag("json")) console.log(JSON.stringify(reports, null, 2));
  else for (const r of reports) console.log(formatScenario(r));
  const failed = reports.filter((r) => !r.ok).length;
  if (!flag("json")) console.log(`
${reports.length - failed}/${reports.length} scenarios passed`);
  return failed ? 1 : 0;
}

function inspect(): number {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
  const { manifest, warnings } = compileAssets(root);
  const dist = join(root, "dist");
  const summary = {
    name: pkg.name,
    dependencies: pkg.dependencies ?? {},
    assets: {
      count: Object.keys(manifest.assets).length,
      bytes: Object.values(manifest.assets).reduce((n, a) => n + a.bytes, 0),
      byId: manifest.assets,
      unused: findUnused(root, manifest),
      warnings,
    },
    build: existsSync(dist) ? { totals: buildReport(dist).totals } : null,
    runtime: "Live params and scene state: window.__DEBUFF_DEV__ in the dev server, or `debuff scenario`.",
  };
  console.log(JSON.stringify(summary, null, 2));
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
