#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { amber, banner, lime, paint, pc, pink, sky } from "create-debuff";
import { compileAssets, findUnused, writeAssetTypes } from "./assets/index.js";
import { Cli } from "./commands.js";
import { loadConfig } from "./config.js";
import { DebuffError, describeError, EXIT } from "./errors.js";
import { markTested } from "./hook.js";
import { inspectProject } from "./inspect.js";
import type { ToolingPlugin } from "./plugin.js";
import { type BuildReport, buildReport, formatReport } from "./report.js";
import { checkSaves, type SaveCheck } from "./saves.js";
import { createDevServer, viteConfig } from "./vite.js";

const cli = new Cli("debuff");

// With --json (and for `inspect`), stdout carries exactly one JSON document: the command's result, or
// { error } when it fails. Everything else written to stdout (logs, Vite's typecheck line) goes to stderr.
// Plugin commands (`name:command`) print their own output, so they're left alone.
const commandName = process.argv.slice(2).find((a) => !a.startsWith("-"));
const jsonMode = (process.argv.includes("--json") || commandName === "inspect") && !commandName?.includes(":");
const writeStdout = process.stdout.write.bind(process.stdout);
if (jsonMode) process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
/** Print the command's machine-readable result: the one thing on stdout in JSON mode. */
const emit = (value: unknown) =>
  writeStdout(`${JSON.stringify(value, null, 2)}
`);
const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

interface Common {
  root?: string;
  json?: boolean;
}
const rootOf = (o: Common) => {
  const root = resolve(o.root ?? process.cwd());
  if (!existsSync(root)) throw new DebuffError("not_a_project", `No such folder: ${root}`, "Pass --root <dir> with the project's folder");
  return root;
};
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
  .option("--no-git", "Don't start a git repository with a first commit")
  .action(async (dir: string | undefined, o: { template?: string; yes?: boolean; noGit?: boolean }) => {
    const { runCreate } = await import("create-debuff");
    return runCreate({ dir, template: o.template, yes: o.yes ?? false, git: o.noGit !== true });
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
  .option("--accept-saves", "Accept changes to the game's saves and update saves.json")
  .action(async (o: Common & { sourcemap?: boolean; acceptSaves?: boolean }) => {
    const root = rootOf(o);
    const { build } = await import("vite");
    if (!o.json) header("build", "shipping only what you use");
    const s = o.json ? undefined : p.spinner();
    s?.start("Bundling");
    const config = await loadConfig(root);
    await build(await viteConfig(root, { logLevel: "error", build: { sourcemap: o.sourcemap ?? false } }, config));
    s?.stop("Bundled");
    const { writeLaunchFiles } = await import("./launch.js");
    for (const w of writeLaunchFiles(root, join(root, "dist"), config.launch)) {
      if (o.json) console.error(`launch: ${w}`);
      else p.log.warn(`launch: ${w}`);
    }
    if (config.isolation) {
      const { writeHeadersFile } = await import("./isolation.js");
      const file = writeHeadersFile(join(root, "dist"), config.isolation.embed);
      const note = file
        ? "isolation: wrote dist/_headers (Cloudflare, Netlify); other hosts need their own headers"
        : "isolation: your dist/_headers already sets Cross-Origin-Embedder-Policy, left as is";
      if (o.json) console.error(note);
      else p.log.info(note);
    }
    const code = report(root, o.json ?? false, o.acceptSaves ?? false);
    if (code === 0) {
      const { reportBuild } = await import("./telemetry.js");
      await reportBuild(root, version, (text) => (o.json ? console.error(text) : console.log(pc.dim(text))));
    }
    return code;
  });

cli
  .command("ship <target>", "Get dist/ ready for a store and check what it needs: itch, wavedash or press")
  .option("--root <dir>", "Project root")
  .option("--json", "Machine-readable output")
  .action(async (target: string, o: Common) => {
    const { ship, shipFailed, SHIP_TARGETS } = await import("./ship.js");
    const known = SHIP_TARGETS.find((t) => t === target);
    if (!known) {
      console.error(`Unknown target "${target}": use ${SHIP_TARGETS.join(", ")}.`);
      return 1;
    }
    const root = rootOf(o);
    const config = await loadConfig(root);
    const result = ship(root, known, config.launch, config.isolation !== null);
    const failed = shipFailed(result);
    if (o.json) {
      emit({ ...result, ok: !failed });
      return failed ? 1 : 0;
    }
    header(`ship ${target}`, "out the door");
    for (const c of result.checks) {
      if (c.ok) p.log.success(c.message);
      else if (c.required === false) p.log.warn(c.message);
      else p.log.error(c.message);
    }
    for (const f of result.outputs) p.log.message(sky(f));
    if (!failed) for (const n of result.next) p.log.info(n);
    finish(!failed, failed ? "not ready yet" : `ready for ${target}`);
    return failed ? 1 : 0;
  });

cli
  .command("telemetry [mode]", "Anonymous build registration: on, off or status (the default)")
  .action(async (mode: string | undefined) => {
    const { setTelemetry, telemetryOff, TELEMETRY_DOCS, userConfigFile } = await import("./telemetry.js");
    if (mode === "on" || mode === "off") setTelemetry(mode === "on");
    else if (mode && mode !== "status") {
      console.error(`Unknown mode "${mode}": use on, off or status.`);
      return 1;
    }
    const off = telemetryOff();
    console.log(off ? `Telemetry is off (${off}).` : "Telemetry is on: `debuff build` registers the project anonymously.");
    console.log(pc.dim(`Settings: ${userConfigFile()} · what's sent: ${TELEMETRY_DOCS}`));
    return 0;
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
    writeAssetTypes(root, manifest);
    const unused = findUnused(root, manifest);
    const count = Object.keys(manifest.assets).length;
    if (o.json) {
      emit({ manifest, importedBy, generated: [...outputs.keys()], warnings, unused });
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
    const { plugins, viewport } = await loadConfig(root);
    // Write the scenario schema including plugin steps, so editors and agents can validate them.
    const { scenarioSchema } = await import("./scenario/index.js");
    mkdirSync(join(root, ".debuff"), { recursive: true });
    writeFileSync(
      join(root, ".debuff", "scenario.schema.json"),
      `${JSON.stringify(scenarioSchema(plugins), null, 2)}
`,
    );
    const reports = await runScenarios({
      root,
      files,
      plugins,
      update: o.update ?? false,
      strict: o.strict ?? false,
      ...(viewport ? { viewport } : {}),
    });
    finished = true;
    markTested(root);
    const failed = reports.filter((r) => !r.ok).length;
    if (o.json) emit(reports);
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
      markTested(root);
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
    markTested(root);
    if (o.json) emit(report);
    else finish(report.ok, report.ok ? "all good" : "some tests failed", formatSummary(report));
    return report.ok ? 0 : 1;
  });

cli
  .command("fuzz", "Play the game with random input to find crashes, stuck states and loops")
  .option("--root <dir>", "Project root")
  .option("--seconds <n>", "Simulated seconds of play per run", { default: 60 })
  .option("--runs <n>", "Independent runs", { default: 3 })
  .option("--seed <n>", "Input seed, to repeat a run exactly")
  .option(
    "--keys <codes>",
    "Comma-separated KeyboardEvent.code values to press (PointerRight and PointerMiddle press mouse buttons; Wheel scrolls and Touch taps or drags a finger)",
  )
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
    if (o.json) emit(report);
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
  .command("doctor", "Check the project's setup: Node, packages, config, assets, browser and agent files")
  .option("--root <dir>", "Project root")
  .option("--live", "Also start the dev server and check the game exposes its dev hooks")
  .option("--fix", "Apply the safe fixes (installs, missing agent files), then check again")
  .option("--json", "Machine-readable output")
  .action(async (o: Common & { live?: boolean; fix?: boolean }) => {
    const { repairDoctor, runDoctor } = await import("./doctor.js");
    if (!o.json) header("doctor", "checking under the hood");
    const root = rootOf(o);
    let result = await runDoctor(root, { live: o.live ?? false });
    let fixed: string[] = [];
    if (o.fix) {
      fixed = repairDoctor(root, result, o.json ? undefined : (line) => p.log.step(line));
      if (fixed.length) result = await runDoctor(root, { live: o.live ?? false });
    }
    if (o.json) {
      emit(o.fix ? { ...result, fixed } : result);
      return result.ok ? EXIT.ok : EXIT.setup;
    }
    for (const c of result.checks) {
      const text = c.fix && !c.ok ? `${c.message}\n${pc.dim(`fix: ${c.fix}`)}` : c.message;
      if (c.ok) p.log.success(text);
      else if (c.required === false) p.log.warn(text);
      else p.log.error(text);
    }
    const problems = result.checks.filter((c) => !c.ok && c.required !== false).length;
    const advice = result.checks.filter((c) => !c.ok && c.required === false).length;
    const repairable = result.checks.some((c) => !c.ok && c.repair);
    finish(
      result.ok,
      result.ok ? "all set" : `${problems} problem${problems === 1 ? "" : "s"} to fix`,
      repairable && !o.fix
        ? pc.dim("--fix applies the safe fixes")
        : advice
          ? amber(`${advice} suggestion${advice === 1 ? "" : "s"}`)
          : o.live
            ? ""
            : pc.dim("--live also boots the game"),
    );
    return result.ok ? EXIT.ok : EXIT.setup;
  });

cli
  .command("upgrade", "Move every debuff package to the latest release together, install, and refresh the agent skills")
  .option("--root <dir>", "Project root")
  .option("--to <version>", "A version to move to instead of the latest")
  .option("--dry-run", "Show what would change without changing anything")
  .option("--json", "Machine-readable output")
  .action(async (o: Common & { to?: string; dryRun?: boolean }) => {
    const { runUpgrade } = await import("./upgrade.js");
    if (!o.json) header("upgrade", o.dryRun ? "what would change" : "moving to the latest");
    const result = await runUpgrade(rootOf(o), {
      ...(o.to !== undefined && { to: String(o.to) }),
      dryRun: o.dryRun === true,
      ...(!o.json && { log: (line: string) => p.log.step(line) }),
    });
    const ok = result.doctor?.ok !== false;
    if (o.json) {
      emit(result);
      return ok ? EXIT.ok : EXIT.setup;
    }
    for (const pkg of result.packages)
      p.log.info(pkg.from === pkg.to ? `${pkg.name} ${pkg.from}` : `${pkg.name} ${pkg.from} ${pc.dim("→")} ${lime(pkg.to)}`);
    for (const line of result.doctor?.fixed ?? []) p.log.step(line);
    finish(
      ok,
      !result.changes ? `already on ${result.to}` : o.dryRun ? `would move to ${result.to}` : `on ${result.to}`,
      result.changes ? pc.dim(`what changed: ${result.changelog}`) : "",
    );
    if (result.doctor && !result.doctor.ok) p.log.warn("Some setup checks still fail: run `npx debuff doctor` for the fixes");
    return ok ? EXIT.ok : EXIT.setup;
  });

cli
  .command("inspect", "JSON summary of the project for agents and tools")
  .option("--root <dir>", "Project root")
  .action(async (o: Common) => {
    emit(await inspectProject(rootOf(o)));
    return 0;
  });

function report(root: string, json: boolean, acceptSaves = false): number {
  const r: BuildReport & { saves?: SaveCheck } = buildReport(join(root, "dist"));
  const saves = checkSaves(root, { accept: acceptSaves });
  if (saves) r.saves = saves;
  const saveErrors = saves?.issues.filter((i) => i.level === "error") ?? [];
  writeFileSync(join(root, "dist", "debuff-report.json"), `${JSON.stringify(r, null, 2)}\n`);
  if (json) emit(r);
  else {
    console.log(formatReport(r));
    if (saves) printSaves(saves);
    const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;
    if (r.leaks.length) finish(false, "dev-only code leaked into the build", amber(r.leaks.map((l) => l.path).join(", ")));
    else if (saveErrors.length)
      finish(false, "this build would break players' saves", "fix it, or run `debuff build --accept-saves` if that's intended");
    else
      finish(
        true,
        "build ready in dist/",
        `${sky(kb(r.initial.brotli))} ${pc.dim("code at startup, brotli ·")} ${pink(kb(r.totals.asset.bytes))} ${pc.dim("assets")}${
          r.totals.code.brotli > r.initial.brotli ? pc.dim(` · +${kb(r.totals.code.brotli - r.initial.brotli)} on demand`) : ""
        }`,
      );
  }
  return r.leaks.length || saveErrors.length ? 1 : 0;
}

/** Saves the build found and what changed since saves.json (ADR 0014). Notes only show when something changed. */
function printSaves(c: SaveCheck): void {
  const keys = c.saves.map((s) => s.key).join(", ");
  if (c.accepted) console.log(pc.dim(`saves: ${keys || "none"} recorded in saves.json`));
  for (const i of c.issues) {
    const text = `save ${i.key}: ${i.message}`;
    if (i.level === "error") p.log.error(text);
    else if (i.level === "warning") p.log.warn(text);
    else console.log(pc.dim(text));
  }
  for (const u of c.unchecked) console.log(pc.dim(`save not checked in ${u.file}: ${u.reason}`));
  if (!c.accepted && !c.issues.length && c.saves.length) console.log(pc.dim(`saves: ${keys} unchanged`));
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
      const name = commandName ?? process.argv[2];
      if (jsonMode) fail(new DebuffError("unknown_command", `Unknown command: ${name}`, "Run `npx debuff --help` for the commands"));
      console.error(pc.red(`unknown command: ${name}\n`));
      cli.outputHelp();
      process.exit(EXIT.usage);
    }
    cli.outputHelp();
    return;
  }
  const code = (await cli.runMatchedCommand()) as number | undefined;
  // Once a day, one line on stderr when a newer debuff is out. Never in JSON mode, and not after commands
  // that already cover it (doctor, upgrade) or that a human runs once (create).
  const name = cli.matchedCommand.name;
  if (!jsonMode && !["doctor", "upgrade", "create", "dev"].includes(name) && !name.includes(":")) {
    const { updateHint } = await import("./versions.js");
    const hint = await updateHint(version);
    if (hint) console.error(pc.dim(hint));
  }
  process.exit(code ?? 0);
}

/** Report what went wrong (one JSON error in JSON mode) and exit with the code that says what to do next. */
function fail(err: unknown): never {
  const e = describeError(err);
  if (jsonMode) {
    emit({ error: { code: e.code, message: e.message, ...(e.fix && { fix: e.fix }), transient: e.transient } });
    process.exit(e.exit);
  }
  // Setup problems and the unexpected are what doctor checks; usage errors already say what to type.
  const name = cli.matchedCommand?.name;
  const doctor = (e.exit === EXIT.setup || e.code === "unexpected") && name !== "doctor" && name !== "create";
  const hints = [
    e.fix && pc.dim(`fix: ${e.fix}`),
    doctor && e.code !== "unexpected" && pc.dim("run `npx debuff doctor` to check the setup"),
  ];
  p.log.error([e.message, ...hints.filter(Boolean)].join("\n"));
  process.exit(e.exit);
}

main().catch(fail);
