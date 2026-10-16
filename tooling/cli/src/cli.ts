#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import cac from "cac";
import { badge } from "create-debuff";
import pc from "picocolors";
import { compileAssets, findUnused } from "./assets/index.js";
import { loadConfig } from "./config.js";
import type { ToolingPlugin } from "./plugin.js";
import { buildReport, formatReport } from "./report.js";
import { createDevServer, viteConfig } from "./vite.js";

const cli = cac("debuff");
const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

interface Common {
  root?: string;
  json?: boolean;
}
const rootOf = (o: Common) => resolve(o.root ?? process.cwd());
const banner = (title: string) => p.intro(`${badge()} ${pc.bold(title)}`);

cli
  .command("create [dir]", "Scaffold a new game")
  .option("--template <id>", "Template to use")
  .option("-y, --yes", "Accept defaults without prompting")
  .action(async (dir: string | undefined, o: { template?: string; yes?: boolean }) => {
    const { runCreate } = await import("create-debuff");
    return runCreate({ dir, template: o.template, yes: o.yes ?? false });
  });

cli
  .command("dev", "Start the dev server with hot reload")
  .option("--root <dir>", "Project root")
  .option("--port <port>", "Port", { default: 5173 })
  .option("--host", "Expose on the local network (test on phones)")
  .action(async (o: Common & { port: number; host?: boolean }) => {
    const server = await createDevServer(rootOf(o), { port: o.port, host: o.host ?? false });
    await server.listen();
    banner("dev server");
    server.printUrls();
    console.log(pc.dim("  Dev hooks: window.__DEBUFF_DEV__  ·  press h + enter for vite shortcuts\n"));
    server.bindCLIShortcuts({ print: false });
    return new Promise<number>(() => {});
  });

cli
  .command("build", "Production build with size report; fails if dev code leaks")
  .option("--root <dir>", "Project root")
  .option("--json", "Machine-readable report")
  .option("--sourcemap", "Emit source maps")
  .action(async (o: Common & { sourcemap?: boolean }) => {
    const root = rootOf(o);
    const { build } = await import("vite");
    if (!o.json) banner("build");
    const s = o.json ? undefined : p.spinner();
    s?.start("Bundling");
    await build(await viteConfig(root, { logLevel: "error", build: { sourcemap: o.sourcemap ?? false } }));
    s?.stop("Bundled");
    return report(root, o.json ?? false);
  });

cli
  .command("report", "Size report for an existing build")
  .option("--root <dir>", "Project root")
  .option("--json", "Machine-readable output")
  .action((o: Common) => report(rootOf(o), o.json ?? false));

cli
  .command("assets", "Run the asset pipeline and print the manifest summary")
  .option("--root <dir>", "Project root")
  .option("--json", "Print the full manifest and diagnostics as JSON")
  .action(async (o: Common) => {
    const root = rootOf(o);
    const config = await loadConfig(root);
    const { manifest, warnings, importedBy, outputs } = await compileAssets(root, { plugins: config.plugins });
    const unused = findUnused(root, manifest);
    const count = Object.keys(manifest.assets).length;
    if (o.json) {
      console.log(JSON.stringify({ manifest, importedBy, generated: [...outputs.keys()], warnings, unused }, null, 2));
      return 0;
    }
    banner("assets");
    for (const [id, a] of Object.entries(manifest.assets)) {
      p.log.message(`${pc.cyan(id)} ${pc.dim(a.type)}  ${pc.dim(`${(a.bytes / 1024).toFixed(1)} kB · ${importedBy[id]}`)}`);
    }
    p.log.success(`${count} assets${outputs.size ? `, ${outputs.size} generated` : ""}`);
    for (const w of warnings) p.log.warn(w);
    if (unused.length) p.log.info(`Possibly unused (no id reference in src/): ${unused.map((u) => pc.yellow(u)).join(", ")}`);
    p.outro("Done");
    return 0;
  });

cli
  .command("scenario [...files]", "Run scenarios/*.json in a headless browser")
  .option("--root <dir>", "Project root")
  .option("--update", "Overwrite baselines with new captures")
  .option("--strict", "Fail when a baseline is missing (use in CI)")
  .option("--json", "Machine-readable output")
  .action(async (files: string[], o: Common & { update?: boolean; strict?: boolean }) => {
    const { runScenarios, formatScenario } = await import("./scenario/index.js");
    // Never let an early exit read as success in CI.
    let finished = false;
    process.once("exit", (code) => {
      if (!finished && code === 0) process.exitCode = 1;
    });
    if (!o.json) {
      banner("scenarios");
      // A spinner here cancels itself when the browser process starts, so use a plain status line.
      p.log.step("Starting dev server and browser");
    }
    const root = rootOf(o);
    const { plugins } = await loadConfig(root);
    // Write the scenario schema including plugin steps, so editors and agents can validate them.
    const { scenarioSchema } = await import("./scenario/index.js");
    mkdirSync(join(root, ".debuff"), { recursive: true });
    writeFileSync(
      join(root, ".debuff", "scenario.schema.json"),
      `${JSON.stringify(scenarioSchema(plugins), null, 2)}
`,
    );
    const reports = await runScenarios({ root, files, plugins, update: o.update ?? false, strict: o.strict ?? false });
    finished = true;
    const failed = reports.filter((r) => !r.ok).length;
    if (o.json) console.log(JSON.stringify(reports, null, 2));
    else {
      for (const r of reports) {
        const text = formatScenario(r);
        if (r.ok) p.log.success(text);
        else p.log.error(text);
      }
      const summary = `${reports.length - failed}/${reports.length} passed`;
      if (failed) p.cancel(pc.red(summary));
      else p.outro(pc.green(summary));
    }
    return failed ? 1 : 0;
  });

cli
  .command("inspect", "JSON summary of the project for agents and tools")
  .option("--root <dir>", "Project root")
  .action(async (o: Common) => {
    const root = rootOf(o);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    const config = await loadConfig(root);
    const { manifest, warnings } = await compileAssets(root, { plugins: config.plugins });
    const dist = join(root, "dist");
    console.log(
      JSON.stringify(
        {
          name: pkg.name,
          debuff: version,
          dependencies: pkg.dependencies ?? {},
          config: config.file ?? null,
          plugins: config.plugins.map((pl) => ({
            name: pl.name,
            apiVersion: pl.apiVersion,
            importers: (pl.assets ?? []).map((i) => ({
              name: i.name,
              extensions: i.extensions,
              kind: "command" in i ? "command" : "function",
            })),
            vite: Boolean(pl.vite),
          })),
          assets: {
            count: Object.keys(manifest.assets).length,
            bytes: Object.values(manifest.assets).reduce((n, a) => n + a.bytes, 0),
            byId: manifest.assets,
            unused: findUnused(root, manifest),
            warnings,
          },
          build: existsSync(dist) ? { totals: buildReport(dist).totals } : null,
          runtime: "Live params and scene state: window.__DEBUFF_DEV__ in the dev server, or `debuff scenario`.",
        },
        null,
        2,
      ),
    );
    return 0;
  });

function report(root: string, json: boolean): number {
  const r = buildReport(join(root, "dist"));
  writeFileSync(join(root, "dist", "debuff-report.json"), `${JSON.stringify(r, null, 2)}\n`);
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(formatReport(r));
    if (r.leaks.length) p.cancel(pc.red("Dev-only code leaked into the production build"));
    else p.outro(pc.green("Build ready in dist/"));
  }
  return r.leaks.length ? 1 : 0;
}

cli.help();
cli.version(version);

/** Register `debuff <plugin>:<command>` for every command contributed by plugins in debuff.config.ts. */
async function registerPluginCommands(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv.find((a) => !a.startsWith("-"));
  const wantsHelp = argv.length === 0 || argv.includes("--help") || argv.includes("-h");
  if (!command?.includes(":") && !wantsHelp) return;
  const rootIndex = argv.indexOf("--root");
  const root = resolve(rootIndex >= 0 ? (argv[rootIndex + 1] ?? ".") : process.cwd());
  let plugins: ToolingPlugin[];
  try {
    ({ plugins } = await loadConfig(root));
  } catch (err) {
    if (!wantsHelp) throw err;
    return;
  }
  for (const plugin of plugins) {
    for (const def of plugin.commands ?? []) {
      const cmd = cli.command(`${plugin.name}:${def.name} [...args]`, `${def.description} ${pc.dim(`(${plugin.name})`)}`);
      cmd.option("--root <dir>", "Project root").option("--json", "Machine-readable output");
      for (const opt of def.options ?? [])
        cmd.option(opt.flags, opt.description, opt.default === undefined ? undefined : { default: opt.default });
      cmd.action((args: string[], options: Record<string, unknown> & Common) =>
        def.run({ root: rootOf(options), args, options, json: Boolean(options.json) }),
      );
    }
  }
}

async function main(): Promise<void> {
  await registerPluginCommands();
  cli.parse(process.argv, { run: false });
  if (!cli.matchedCommand) {
    // cac has already printed help or the version for these flags.
    if (cli.options.help || cli.options.version) return;
    if (process.argv.length > 2) {
      console.error(pc.red(`Unknown command: ${process.argv.slice(2).join(" ")}\n`));
      cli.outputHelp();
      process.exit(1);
    }
    cli.outputHelp();
    return;
  }
  const code = (await cli.runMatchedCommand()) as number | undefined;
  process.exit(code ?? 0);
}

main().catch((err: unknown) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
