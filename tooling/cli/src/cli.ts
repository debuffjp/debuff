#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { amber, banner, lime, paint, pc, pink, sky } from "create-debuff";
import { compileAssets, findUnused } from "./assets/index.js";
import { Cli } from "./commands.js";
import { loadConfig } from "./config.js";
import { inspectProject } from "./inspect.js";
import type { ToolingPlugin } from "./plugin.js";
import { buildReport, formatReport } from "./report.js";
import { createDevServer, viteConfig } from "./vite.js";

const cli = new Cli("debuff");
const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

interface Common {
  root?: string;
  json?: boolean;
}
const rootOf = (o: Common) => resolve(o.root ?? process.cwd());
/** Command header: buff beside the name, version, command and a tagline. */
const header = (title: string, tagline: string) =>
  console.log(`\n${banner("idle", [`${lime(pc.bold("debuff"))} ${pc.dim(`v${version}`)}`, pc.bold(title), pc.dim(pc.italic(tagline))])}\n`);
/** Result footer: buff reacts to how it went. */
const finish = (ok: boolean, title: string, detail = "") =>
  console.log(`\n${banner(ok ? "happy" : "oops", [ok ? lime(pc.bold(title)) : paint("red", pc.bold(title)), detail, ""])}\n`);
const violetType = (type: string) => paint("violet", type);

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
    const server = await createDevServer(rootOf(o), { port: o.port, host: o.host ?? false, agentLink: true });
    await server.listen();
    header("dev server", "more room for play");
    for (const url of server.resolvedUrls?.local ?? []) console.log(`  ${lime("➜")}  ${pc.bold("local")}    ${sky(url)}`);
    for (const url of server.resolvedUrls?.network ?? []) console.log(`  ${lime("➜")}  ${pc.bold("network")}  ${sky(url)}`);
    console.log(
      `\n  ${pc.dim("press")} ${amber("`")} ${pc.dim("in the game for the dev overlay ·")} ${pink("h + enter")} ${pc.dim("for shortcuts")}\n`,
    );
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
    if (!o.json) header("build", "shipping only what you use");
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
    const { manifest, warnings, importedBy, outputs } = await compileAssets(root, { plugins: config.plugins, atlas: config.atlas });
    const unused = findUnused(root, manifest);
    const count = Object.keys(manifest.assets).length;
    if (o.json) {
      console.log(JSON.stringify({ manifest, importedBy, generated: [...outputs.keys()], warnings, unused }, null, 2));
      return 0;
    }
    header("assets", "your source files, never touched");
    for (const [id, a] of Object.entries(manifest.assets)) {
      const packed = a.rect ? ` · ${sky(`atlas ${a.src.slice(a.src.lastIndexOf("/") + 1)}`)}` : "";
      p.log.message(`${pink(id)} ${violetType(a.type)}  ${pc.dim(`${(a.bytes / 1024).toFixed(1)} kB · ${importedBy[id]}`)}${packed}`);
    }
    p.log.success(`${count} assets${outputs.size ? `, ${outputs.size} generated` : ""}`);
    for (const w of warnings) p.log.warn(w);
    if (unused.length) p.log.info(`Possibly unused (no id reference in src/): ${unused.map((u) => amber(u)).join(", ")}`);
    finish(true, `${count} assets ready`, outputs.size ? sky(`${outputs.size} generated`) : "");
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
      header("scenarios", "same inputs, same game");
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
      const summary = `${reports.length - failed}/${reports.length} scenarios passed`;
      finish(!failed, summary, failed ? amber("details in .debuff/reports/") : "");
    }
    return failed ? 1 : 0;
  });

cli
  .command("test [...files]", "Run logic tests (tests/**/*.test.ts) against the real game in Node, no browser")
  .option("--root <dir>", "Project root")
  .option("-t, --filter <text>", "Only run tests whose name contains this text")
  .option("--json", "Machine-readable output")
  .action(async (files: string[], o: Common & { filter?: string }) => {
    const { runTests, formatResult, formatSummary, findTests } = await import("keiko/runner");
    const root = rootOf(o);
    if (!findTests(root, files).length) {
      if (o.json)
        console.log(
          JSON.stringify({ ok: true, passed: 0, failed: 0, skipped: 0, todo: 0, durationMs: 0, results: [], outside: [] }, null, 2),
        );
      else p.log.info(`No tests yet. Add one in tests/, e.g. tests/movement.test.ts. Guide: ${sky("https://debuff.jp/docs/testing")}`);
      return 0;
    }
    if (!o.json) header("tests", "fast hands, no browser");
    const report = await runTests({
      root,
      files,
      vite: await viteConfig(root),
      debuff: true,
      ...(o.filter ? { filter: String(o.filter) } : {}),
      ...(o.json
        ? {}
        : {
            onResult: (r) => {
              const text = formatResult(r);
              if (r.status === "fail") p.log.error(text);
              else if (r.status === "pass") p.log.success(text);
              else p.log.info(text);
            },
          }),
    });
    if (o.json) console.log(JSON.stringify(report, null, 2));
    else finish(report.ok, report.ok ? "all good" : "some tests failed", formatSummary(report));
    return report.ok ? 0 : 1;
  });

cli
  .command("fuzz", "Play the game with random input to find crashes, stuck states and loops")
  .option("--root <dir>", "Project root")
  .option("--seconds <n>", "Simulated seconds of play per run", { default: 60 })
  .option("--runs <n>", "Independent runs", { default: 3 })
  .option("--seed <n>", "Input seed, to repeat a run exactly")
  .option("--keys <codes>", "Comma-separated KeyboardEvent.code values to press")
  .option("--ignore <paths>", "Comma-separated state paths the loop check skips, e.g. state.shots")
  .option("--json", "Machine-readable output")
  .action(async (o: Common & { seconds: number; runs: number; seed?: number; keys?: string; ignore?: string }) => {
    const { runFuzz } = await import("./fuzz.js");
    if (!o.json) {
      header("fuzz", "random hands, real bugs");
      p.log.step(`Playing ${o.runs} × ${o.seconds} s with random input`);
    }
    const report = await runFuzz({
      root: rootOf(o),
      seconds: Number(o.seconds),
      runs: Number(o.runs),
      ...(o.seed === undefined ? {} : { seed: Number(o.seed) }),
      ...(o.ignore
        ? {
            ignore: o.ignore
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
          }
        : {}),
      ...(o.keys
        ? {
            keys: o.keys
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
          }
        : {}),
    });
    const errors = report.findings.filter((f) => f.kind === "error");
    if (o.json) console.log(JSON.stringify(report, null, 2));
    else {
      for (const f of report.findings) {
        const where = (f.error as { where?: { file: string; line: number } } | undefined)?.where;
        const text = `${f.kind === "error" ? pink("error") : amber(f.kind)} run ${f.run} · tick ${f.tick} · ${f.message}${where ? sky(` → ${where.file}:${where.line}`) : ""}\n  replay: ${pc.dim(`debuff scenario ${f.repro}`)}`;
        if (f.kind === "error") p.log.error(text);
        else p.log.warn(text);
      }
      const minutes = (report.steps / 3600).toFixed(1);
      finish(
        !errors.length,
        `${report.findings.length ? `${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}` : "no crashes, stuck states or loops"} in ${minutes} min of play`,
        `seed ${report.seed} · repeat with --seed ${report.seed}`,
      );
    }
    return errors.length ? 1 : 0;
  });

cli
  .command("inspect", "JSON summary of the project for agents and tools")
  .option("--root <dir>", "Project root")
  .action(async (o: Common) => {
    console.log(JSON.stringify(await inspectProject(rootOf(o)), null, 2));
    return 0;
  });

function report(root: string, json: boolean): number {
  const r = buildReport(join(root, "dist"));
  writeFileSync(join(root, "dist", "debuff-report.json"), `${JSON.stringify(r, null, 2)}\n`);
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(formatReport(r));
    const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;
    if (r.leaks.length) finish(false, "dev-only code leaked into the build", amber(r.leaks.map((l) => l.path).join(", ")));
    else
      finish(
        true,
        "build ready in dist/",
        `${sky(kb(r.initial.brotli))} ${pc.dim("code at startup, brotli ·")} ${pink(kb(r.totals.asset.bytes))} ${pc.dim("assets")}${
          r.totals.code.brotli > r.initial.brotli ? pc.dim(` · +${kb(r.totals.code.brotli - r.initial.brotli)} on demand`) : ""
        }`,
      );
  }
  return r.leaks.length ? 1 : 0;
}

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
  cli.parse(process.argv);
  if (!cli.matchedCommand) {
    // parse() has already printed help or the version for these flags.
    if (cli.options.help || cli.options.version) return;
    if (process.argv.length > 2) {
      console.error(pc.red(`unknown command: ${process.argv.slice(2).find((a) => !a.startsWith("-")) ?? process.argv[2]}\n`));
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
