/** The `myaku` command. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { Page } from "playwright-core";
import { type Budget, checkBudgets, record } from "./record.js";

const HELP = `myaku: a frame profiler for web games

Usage:
  npx myaku record [url-or-folder] [options]

Plays the game in Chrome or Edge with myaku injected (no changes to the game),
then prints frame-time percentiles and the worst hitches, explained.
Default target: ./dist (a production build), served locally.

Options:
  --seconds <n>     Seconds to record (default 10)
  --warmup <n>      Seconds to wait after load before recording (default 1)
  --cpu <n>         Slow the CPU down n times, e.g. 4 for a mid-range phone
  --viewport <WxH>  Window size (default 1280x720)
  --play <file>     A module whose default export, async (page) => {}, plays the game
  --headed          Show the browser
  --trace           Also record Chrome's trace: check hitches against presented
                    frames, and name GPU and compositor causes (a little slower)
  --p95 <ms>        Fail if 95th-percentile frame time is over this
  --p99 <ms>        Fail if 99th-percentile frame time is over this
  --hitches <n>     Fail if there are more hitches per minute than this
  --out <file>      Write the report and budgets as JSON
  --json            Print JSON instead of text
  -h, --help        Show this help

Exit codes: 0 ok, 1 over budget, 2 error.
Docs: https://debuff.jp/myaku/record`;

const NO_COLOR = "NO_COLOR" in process.env || !process.stdout.isTTY;
const paint = (code: number) => (s: string) => (NO_COLOR ? s : `\x1b[${code}m${s}\x1b[0m`);
const dim = paint(2);
const bold = paint(1);
const red = paint(31);
const green = paint(32);

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      seconds: { type: "string" },
      warmup: { type: "string" },
      cpu: { type: "string" },
      viewport: { type: "string" },
      play: { type: "string" },
      headed: { type: "boolean" },
      trace: { type: "boolean" },
      p95: { type: "string" },
      p99: { type: "string" },
      hitches: { type: "string" },
      out: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, target = "dist"] = positionals;
  if (values.help || command !== "record") {
    console.log(HELP);
    return values.help || command === undefined ? 0 : 2;
  }
  const num = (v: string | undefined, name: string) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`--${name} needs a number, got "${v}"`);
    return n;
  };
  const size = values.viewport ? /^(\d+)x(\d+)$/.exec(values.viewport) : null;
  if (values.viewport && !size) throw new Error(`--viewport needs WIDTHxHEIGHT, e.g. 390x844, got "${values.viewport}"`);
  let play: ((page: Page) => Promise<void>) | undefined;
  if (values.play) {
    const mod = (await import(pathToFileURL(resolve(values.play)).href)) as { default?: (page: Page) => Promise<void> };
    if (typeof mod.default !== "function") throw new Error(`${values.play} needs a default export: async (page) => { … }`);
    play = mod.default;
  }

  const seconds = num(values.seconds, "seconds") ?? 10;
  if (!values.json) console.log(dim(`recording ${target} for ${seconds} s…`));
  const report = await record({
    target,
    seconds,
    ...(values.warmup !== undefined ? { warmup: num(values.warmup, "warmup") } : {}),
    ...(values.cpu !== undefined ? { cpuThrottle: num(values.cpu, "cpu") } : {}),
    ...(size ? { viewport: { width: Number(size[1]), height: Number(size[2]) } } : {}),
    ...(values.headed ? { headed: true } : {}),
    ...(values.trace ? { trace: true } : {}),
    ...(play ? { play } : {}),
  });
  const budgets = checkBudgets(report, {
    ...(values.p95 !== undefined ? { p95: num(values.p95, "p95") } : {}),
    ...(values.p99 !== undefined ? { p99: num(values.p99, "p99") } : {}),
    ...(values.hitches !== undefined ? { hitchesPerMinute: num(values.hitches, "hitches") } : {}),
  });
  const ok = budgets.every((b) => b.ok);
  if (values.out) writeFileSync(values.out, `${JSON.stringify({ report, budgets, ok }, null, 2)}\n`);
  if (values.json) console.log(JSON.stringify({ report, budgets, ok }, null, 2));
  else console.log(format(report, budgets));
  return ok ? 0 : 1;
}

function format(r: Awaited<ReturnType<typeof record>>, budgets: Budget[]): string {
  const ms = (n: number) => `${n.toFixed(1)} ms`;
  const lines = [
    "",
    `${bold("frames")}   ${r.frames} in ${r.seconds.toFixed(1)} s · ${r.fps.toFixed(0)} fps · budget ${ms(r.budgetMs)}`,
    `${bold("frame")}    p50 ${ms(r.intervalMs.p50)} · p95 ${ms(r.intervalMs.p95)} · p99 ${ms(r.intervalMs.p99)} · max ${ms(r.intervalMs.max)}`,
    `${bold("code")}     p50 ${ms(r.cpuMs.p50)} · p95 ${ms(r.cpuMs.p95)}`,
    `${bold("hitches")}  ${r.hitches} (${r.hitchesPerMinute.toFixed(1)}/min)${
      Object.keys(r.causes).length
        ? dim(
            ` · ${Object.entries(r.causes)
              .map(([c, n]) => `${c} ${n}`)
              .join(", ")}`,
          )
        : ""
    }`,
  ];
  if (r.trace) {
    const t = r.trace;
    lines.push(
      `${bold("shown")}    p50 ${ms(t.presentedMs.p50)} · p95 ${ms(t.presentedMs.p95)} · p99 ${ms(t.presentedMs.p99)} · max ${ms(t.presentedMs.max)}${dim(` · ${t.presented} presented, ${t.dropped} dropped`)}`,
      `${bold("trace")}    ${t.confirmed} hitches confirmed, ${t.unconfirmed} not seen on screen, ${t.missed.length} missed by myaku${t.reclassified ? `, ${t.reclassified} unknown → gpu/compositor` : ""}${dim(` · GPU ${ms(t.gpuMsPerFrame)}/frame`)}`,
    );
    for (const n of t.notes) lines.push(red(`⚠ ${n}`));
  }
  const spans = Object.entries(r.spans);
  if (spans.length) lines.push(`${bold("spans")}    ${spans.map(([k, v]) => `${k} ${ms(v)}`).join(" · ")}`);
  for (const w of r.warnings) lines.push(red(`⚠ ${w}`));
  if (r.worst.length) {
    lines.push("", bold("worst hitches"));
    for (const v of r.worst.slice(0, 3)) lines.push(`  ${v.cause} · ${v.confidence}  ${v.summary}`, dim(`    ${v.hint}`));
  }
  if (budgets.length) {
    lines.push("", bold("budgets"));
    for (const b of budgets) lines.push(`  ${b.ok ? green("✔") : red("✖")} ${b.name}: ${b.actual} (limit ${b.limit})`);
  }
  return lines.join("\n");
}
