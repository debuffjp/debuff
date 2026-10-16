#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import cac from "cac";
import pc from "picocolors";
import { compileAssets, findUnused } from "./assets.js";
import { buildReport, formatReport } from "./report.js";
import { createDevServer, viteConfig } from "./vite.js";

const cli = cac("debuff");
const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

interface Common {
  root?: string;
  json?: boolean;
}
const rootOf = (o: Common) => resolve(o.root ?? process.cwd());
const banner = (title: string) => p.intro(`${pc.bgMagenta(pc.black(" debuff "))} ${pc.bold(title)}`);

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
    await build(viteConfig(root, { logLevel: "error", build: { sourcemap: o.sourcemap ?? false } }));
    s?.stop("Bundled");
    return report(root, o.json ?? false);
  });

cli
  .command("report", "Size report for an existing build")
  .option("--root <dir>", "Project root")
  .option("--json", "Machine-readable output")
  .action((o: Common) => report(rootOf(o), o.json ?? false));

cli
  .command("assets", "Regenerate the asset manifest and list unused assets")
  .option("--root <dir>", "Project root")
  .option("--json", "Machine-readable output")
  .action((o: Common) => {
    const root = rootOf(o);
    const { manifest, warnings, path } = compileAssets(root);
    const unused = findUnused(root, manifest);
    const count = Object.keys(manifest.assets).length;
    if (o.json) {
      console.log(JSON.stringify({ path, count, warnings, unused }, null, 2));
      return 0;
    }
    banner("assets");
    p.log.success(`${count} assets → ${pc.dim(path)}`);
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
    const s = o.json ? undefined : p.spinner();
    if (!o.json) banner("scenarios");
    s?.start("Starting dev server and browser");
    const reports = await runScenarios({ root: rootOf(o), files, update: o.update ?? false, strict: o.strict ?? false });
    const failed = reports.filter((r) => !r.ok).length;
    s?.stop(`Ran ${reports.length} scenario${reports.length === 1 ? "" : "s"}`);
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
  .action((o: Common) => {
    const root = rootOf(o);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    const { manifest, warnings } = compileAssets(root);
    const dist = join(root, "dist");
    console.log(
      JSON.stringify(
        {
          name: pkg.name,
          debuff: version,
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

async function main(): Promise<void> {
  cli.parse(process.argv, { run: false });
  if (!cli.matchedCommand) {
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
