import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { compileAssets } from "./assets/index.js";
import { loadConfig, type ResolvedConfig } from "./config.js";
import { hooksReady } from "./scenario/browser.js";
import { launchBrowser } from "./scenario/run.js";
import { telemetryOff } from "./telemetry.js";

const cli = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
  engines: { node: string };
};

export type DoctorGroup = "environment" | "packages" | "config" | "assets" | "browser" | "agents" | "runtime";

export interface DoctorCheck {
  /** Stable id, e.g. `node-version`. */
  id: string;
  group: DoctorGroup;
  ok: boolean;
  /** `false` for advice that shouldn't fail the command. */
  required?: boolean;
  message: string;
  /** One command or edit that fixes it. */
  fix?: string;
}

export interface DoctorResult {
  /** The CLI version the packages are checked against. */
  debuff: string;
  checks: DoctorCheck[];
  /** No required check failed. */
  ok: boolean;
}

export interface DoctorOptions {
  /** Launch the system browser that scenarios, fuzzing and the MCP server use. Default true. */
  browser?: boolean;
  /** Start the dev server and wait for the game's dev hooks in a real page. Default false. */
  live?: boolean;
  env?: NodeJS.ProcessEnv;
}

/** Packages released together at one version (`fixed` in .changeset/config.json). tenten ships on its own. */
const inFixedGroup = (name: string) => (name.startsWith("@debuffjp/") && name !== "@debuffjp/tenten") || name === "create-debuff";

/** Check the project's setup: every check runs, so one problem never hides the rest (`debuff doctor`, MCP `doctor`). */
export async function runDoctor(root: string, options: DoctorOptions = {}): Promise<DoctorResult> {
  const env = options.env ?? process.env;
  const checks: DoctorCheck[] = [...environment(env)];
  const pkg = readPackage(root, checks);
  if (pkg) checks.push(...packages(root, pkg));

  let config: ResolvedConfig | undefined;
  try {
    config = await loadConfig(root);
    const plugins = config.plugins.length ? ` with ${config.plugins.map((p) => p.name).join(", ")}` : "";
    const message = config.file ? `${basename(config.file)} loaded${plugins}` : "No debuff.config.ts: defaults";
    checks.push({ id: "config", group: "config", ok: true, message });
  } catch (err) {
    checks.push({ id: "config", group: "config", ok: false, message: errorText(err) });
  }
  if (config) checks.push(...(await assets(root, config)));
  checks.push(saves(root), agentFiles(root));
  if (options.browser !== false) checks.push(await browser());
  if (options.live && config) checks.push(await runtimeHooks(root));

  const off = telemetryOff({ env });
  checks.push({
    id: "telemetry",
    group: "environment",
    ok: true,
    required: false,
    message: off ? `Telemetry is off (${off})` : "Telemetry is on: `debuff build` registers the project anonymously",
  });

  return { debuff: cli.version, checks, ok: !checks.some((c) => !c.ok && c.required !== false) };
}

function environment(env: NodeJS.ProcessEnv): DoctorCheck[] {
  const needed = Number(/(\d+)/.exec(cli.engines.node)?.[1] ?? 0);
  const major = Number(process.versions.node.split(".")[0]);
  const checks: DoctorCheck[] = [
    major >= needed
      ? { id: "node-version", group: "environment", ok: true, message: `Node ${process.versions.node}` }
      : {
          id: "node-version",
          group: "environment",
          ok: false,
          message: `Node ${process.versions.node} is too old: debuff needs ${cli.engines.node}`,
          fix: `Install Node ${needed} or newer from https://nodejs.org`,
        },
  ];
  // Vite derives import.meta.env.DEV from NODE_ENV when it's set, whatever the command.
  const mode = env.NODE_ENV;
  if (mode === "production" || mode === "development")
    checks.push({
      id: "node-env",
      group: "environment",
      ok: false,
      required: false,
      message:
        mode === "production"
          ? "NODE_ENV=production is set: `debuff dev` turns off dev code, so the dev panel, scenarios, fuzzing and the MCP server can't reach the game"
          : "NODE_ENV=development is set: `debuff build` keeps dev code and fails its leak check",
      fix: "Unset NODE_ENV in your shell; debuff picks the mode per command",
    });
  return checks;
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

function readPackage(root: string, checks: DoctorCheck[]): PackageJson | undefined {
  const file = join(root, "package.json");
  if (!existsSync(file)) {
    checks.push({
      id: "package-json",
      group: "packages",
      ok: false,
      message: `No package.json in ${root}`,
      fix: "Run from the project root, or pass --root <dir>",
    });
    return undefined;
  }
  try {
    const pkg = readJson(file) as PackageJson;
    checks.push({ id: "package-json", group: "packages", ok: true, message: "package.json found" });
    return pkg;
  } catch (err) {
    checks.push({ id: "package-json", group: "packages", ok: false, message: `package.json is not valid JSON: ${errorText(err)}` });
    return undefined;
  }
}

/** Where `name` is installed for `root`, looking up through parent node_modules like Node does. */
function installed(root: string, name: string): { dir: string; version: string } | undefined {
  for (let dir = root; ; dir = dirname(dir)) {
    const file = join(dir, "node_modules", name, "package.json");
    if (existsSync(file)) return { dir: dirname(file), version: (readJson(file) as { version: string }).version };
    if (dirname(dir) === dir) return undefined;
  }
}

function packages(root: string, pkg: PackageJson): DoctorCheck[] {
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  const found = new Map(Object.keys(declared).map((name) => [name, installed(root, name)]));
  const checks: DoctorCheck[] = [];

  const missing = [...found].filter(([, i]) => !i).map(([name]) => name);
  const stale = [...found].filter(([name, i]) => i && /^\d+\.\d+\.\d+$/.test(declared[name] ?? "") && declared[name] !== i.version);
  checks.push(
    missing.length || stale.length
      ? {
          id: "installed",
          group: "packages",
          ok: false,
          message: [
            missing.length ? `Not installed: ${missing.join(", ")}` : "",
            stale.length
              ? `Installed versions differ from package.json: ${stale.map(([n, i]) => `${n} ${i?.version} (wants ${declared[n]})`).join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join(". "),
          fix: "npm install",
        }
      : { id: "installed", group: "packages", ok: true, message: `${found.size} packages installed` },
  );

  const debuff = [...found].filter(([name, i]) => inFixedGroup(name) && i) as [string, { dir: string; version: string }][];
  const off = debuff.filter(([, i]) => i.version !== cli.version);
  if (debuff.length)
    checks.push(
      off.length
        ? {
            id: "debuff-versions",
            group: "packages",
            ok: false,
            message: `debuff packages must share one version. The CLI is ${cli.version}, but ${off.map(([n, i]) => `${n} is ${i.version}`).join(", ")}`,
            fix: `Set every @debuffjp/* package in package.json to ${cli.version} (or all to the newest), then npm install`,
          }
        : { id: "debuff-versions", group: "packages", ok: true, message: `debuff packages all at ${cli.version}` },
    );

  // A package with its own nested copy of core gets its own Game class and services.
  const nested = debuff.filter(([, i]) => existsSync(join(i.dir, "node_modules", "@debuffjp", "core"))).map(([n]) => n);
  if (nested.length)
    checks.push({
      id: "duplicate-core",
      group: "packages",
      ok: false,
      required: false,
      message: `More than one copy of @debuffjp/core is installed (nested under ${nested.join(", ")})`,
      fix: "npm dedupe",
    });

  checks.push(
    "@debuffjp/dev" in declared
      ? {
          id: "dev-hooks-package",
          group: "packages",
          ok: true,
          message: "@debuffjp/dev is a dependency: dev hooks for scenarios and agents",
        }
      : {
          id: "dev-hooks-package",
          group: "packages",
          ok: false,
          message: "@debuffjp/dev is missing: scenarios, fuzzing, the dev panel and the MCP server need its dev hooks",
          fix: `npm i -D @debuffjp/dev@${cli.version}`,
        },
  );

  if (Object.values(pkg.scripts ?? {}).some((s) => /\btsc\b/.test(s)))
    checks.push(
      installed(root, "typescript")
        ? { id: "typescript", group: "environment", ok: true, message: "TypeScript is installed" }
        : {
            id: "typescript",
            group: "environment",
            ok: false,
            message: "A package.json script runs tsc, but TypeScript is not installed",
            fix: "npm i -D typescript",
          },
    );
  return checks;
}

async function assets(root: string, config: ResolvedConfig): Promise<DoctorCheck[]> {
  try {
    const { manifest, warnings } = await compileAssets(root, { plugins: config.plugins, atlas: config.atlas });
    const checks: DoctorCheck[] = [
      { id: "assets", group: "assets", ok: true, message: `Asset pipeline runs: ${Object.keys(manifest.assets).length} assets` },
    ];
    if (warnings.length)
      checks.push({
        id: "asset-warnings",
        group: "assets",
        ok: false,
        required: false,
        message: `${warnings.length} asset warning${warnings.length === 1 ? "" : "s"}: ${warnings[0]}${warnings.length > 1 ? " …" : ""}`,
        fix: "npx debuff assets lists them all",
      });
    return checks;
  } catch (err) {
    return [{ id: "assets", group: "assets", ok: false, message: `The asset pipeline failed: ${errorText(err)}` }];
  }
}

function saves(root: string): DoctorCheck {
  const file = join(root, "saves.json");
  if (!existsSync(file)) return { id: "saves", group: "config", ok: true, message: "No saves.json yet: `debuff build` writes it" };
  try {
    readJson(file);
    return { id: "saves", group: "config", ok: true, message: "saves.json is valid" };
  } catch (err) {
    return {
      id: "saves",
      group: "config",
      ok: false,
      message: `saves.json is not valid JSON: ${errorText(err)}`,
      fix: "Restore it from git, or delete it and run `npx debuff build --accept-saves`",
    };
  }
}

function agentFiles(root: string): DoctorCheck {
  const missing = ["AGENTS.md", "CLAUDE.md"].filter((f) => !existsSync(join(root, f)));
  let mcp = false;
  try {
    mcp = Boolean((readJson(join(root, ".mcp.json")) as { mcpServers?: Record<string, unknown> }).mcpServers?.debuff);
  } catch {}
  if (!mcp) missing.push(".mcp.json with the debuff server");
  return missing.length
    ? {
        id: "agent-files",
        group: "agents",
        ok: false,
        required: false,
        message: `AI agents lack project context: missing ${missing.join(", ")}`,
        fix: 'Copy them from a fresh `npm create debuff` project; .mcp.json needs `{ "mcpServers": { "debuff": { "command": "npx", "args": ["-y", "@debuffjp/mcp"] } } }`',
      }
    : { id: "agent-files", group: "agents", ok: true, message: "AGENTS.md, CLAUDE.md and .mcp.json are set up for AI agents" };
}

async function browser(): Promise<DoctorCheck> {
  try {
    const b = await launchBrowser();
    const version = b.version();
    await b.close();
    return { id: "browser", group: "browser", ok: true, message: `Browser for scenarios, fuzzing and agents: ${version}` };
  } catch (err) {
    return {
      id: "browser",
      group: "browser",
      ok: false,
      message: errorText(err),
      fix: "Install Chrome or Edge, or set DEBUFF_BROWSER to a Chromium-based browser executable",
    };
  }
}

/** Open the game under the dev server like scenarios do and wait for its dev hooks. */
async function runtimeHooks(root: string): Promise<DoctorCheck> {
  const { createDevServer } = await import("./vite.js");
  const server = await createDevServer(root, { port: 0, logLevel: "error" });
  const pageErrors: string[] = [];
  let b: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    await server.listen();
    const base = server.resolvedUrls?.local[0];
    if (!base) throw new Error("The dev server did not report a URL");
    b = await launchBrowser();
    const page = await b.newPage();
    page.on("pageerror", (err) => pageErrors.push(err.message));
    const url = new URL("/", base);
    url.searchParams.set("debuff-scenario", "1");
    await page.goto(url.toString());
    await page.waitForFunction(hooksReady, undefined, { timeout: 15_000 });
    return { id: "runtime-hooks", group: "runtime", ok: true, message: "The game starts under `debuff dev` and exposes its dev hooks" };
  } catch (err) {
    return {
      id: "runtime-hooks",
      group: "runtime",
      ok: false,
      message: pageErrors.length
        ? `The game threw while starting: ${pageErrors[0]}`
        : `The game's dev hooks never appeared (${errorText(err).split("\n")[0]})`,
      fix: pageErrors.length
        ? "Fix the error, then run `npx debuff doctor --live` again"
        : "Add `if (import.meta.env.DEV) game.use(devTools({ input }))` (from @debuffjp/dev) to src/main.ts",
    };
  } finally {
    await b?.close();
    await server.close();
  }
}

/** Parse a JSON file, allowing the byte order mark Windows editors add (npm accepts it too). */
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
