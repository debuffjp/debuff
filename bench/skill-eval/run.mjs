// Do coding agents follow debuff's skills? node bench/skill-eval/run.mjs [options]
//
// Makes a platformer project with this repo's create-debuff, then for every task, condition and run: copies it,
// installs, breaks it the way the task says, runs Claude Code headless on the task's prompt, and scores the
// transcript against the task's rubric (tasks.mjs, score.mjs). Conditions:
//
//   skills     the project as create-debuff makes it (.claude/skills and .agents/skills present)
//   noskills   the same project with both skill folders deleted. AGENTS.md, CLAUDE.md and the MCP server's
//              own instructions stay, so this measures what the skills add on top of them
//   bare       no skills, no AGENTS.md or CLAUDE.md: only the MCP server's instructions are left
//
// Options: --tasks a,b  --conditions skills,noskills  --runs 3  --parallel 3  --model sonnet  --budget 4 (USD per run)
//          --timeout 20 (minutes per run)  --judge (score judge items with claude -p; --judge-model, default sonnet)
//          --work <dir> (default: a folder in the OS temp dir; transcripts and diffs stay there)
//          --rescore <work dir> (score an earlier run's transcripts again without running agents)
// Writes results/<date>-<model>.json and prints a table. Needs `npm run build` first (create-debuff's dist).
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTranscript, scoreRun, stats } from "./score.mjs";
import { TASKS } from "./tasks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const win = process.platform === "win32";
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const tasks = TASKS.filter((t) => opt("tasks", t.id).split(",").includes(t.id));
const conditions = opt("conditions", "skills,noskills").split(",");
const runs = Number(opt("runs", "3"));
const parallel = Number(opt("parallel", "3"));
const model = opt("model", "sonnet");
const budget = opt("budget", "4");
const timeout = Number(opt("timeout", "20")) * 60_000;
const judging = argv.includes("--judge");
const JUDGE = opt("judge-model", "sonnet");
const rescore = opt("rescore");
const work = rescore ?? opt("work", join(tmpdir(), `debuff-skill-eval-${new Date().toISOString().slice(0, 10)}`));

const env = { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0", DEBUFF_TELEMETRY: "0", DEBUFF_UPDATE_CHECK: "0" };
delete env.NODE_ENV;
const gitEnv = {
  ...env,
  GIT_AUTHOR_NAME: "eval",
  GIT_AUTHOR_EMAIL: "eval@localhost",
  GIT_COMMITTER_NAME: "eval",
  GIT_COMMITTER_EMAIL: "eval@localhost",
};
// One command string, not an args array: Node deprecates args with `shell: true` (DEP0190). No argument here has spaces.
const sh = (cmd, args, cwd, extra = {}) =>
  spawnSync(win ? [cmd, ...args].join(" ") : cmd, win ? [] : args, { cwd, encoding: "utf8", shell: win, env, timeout: 600_000, ...extra });
const must = (r, what) => {
  if (r.status !== 0) throw new Error(`${what} failed (${r.status}):\n${r.stdout}\n${r.stderr}`);
  return r;
};

/** Run a command asynchronously, feeding `input` on stdin and collecting stdout. */
function run(cmd, args, { cwd, input, ms }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      if (win) spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
      else child.kill("SIGKILL");
    }, ms);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(input ?? "");
  });
}

// ---- the project ------------------------------------------------------------------------------------------

function makeBase() {
  const base = join(work, "base");
  if (existsSync(join(base, "node_modules"))) return base;
  mkdirSync(work, { recursive: true });
  rmSync(base, { recursive: true, force: true });
  const bin = join(repo, "tooling", "create-debuff", "bin", "create-debuff.js");
  must(sh("node", [bin, "base", "--template", "platformer", "--yes", "--no-git"], work), "create-debuff");
  must(sh("npm", ["install", "--no-audit", "--no-fund"], base), "npm install");
  return base;
}

function prepare(base, task, condition, dir) {
  rmSync(dir, { recursive: true, force: true });
  cpSync(base, dir, { recursive: true, filter: (p) => basename(p) !== "node_modules" });
  must(sh("npm", ["ci", "--prefer-offline", "--no-audit", "--no-fund"], dir), "npm ci");
  if (condition !== "skills") for (const d of [".claude/skills", ".agents/skills"]) rmSync(join(dir, d), { recursive: true, force: true });
  if (condition === "bare") for (const f of ["AGENTS.md", "CLAUDE.md"]) rmSync(join(dir, f), { force: true });
  task.setup?.(dir);
  for (const args of [
    ["init", "-q"],
    ["add", "-A"],
    ["commit", "-qm", "start"],
  ])
    must(sh("git", args, dir, { env: gitEnv }), `git ${args[0]}`);
}

// ---- one run ----------------------------------------------------------------------------------------------

const ALLOWED = [
  "Read",
  "Glob",
  "Grep",
  "Edit",
  "Write",
  "Skill",
  "mcp__debuff",
  "mcp__tenten",
  ...["npm", "npx", "node", "git status", "git diff", "git log", "ls", "cat", "grep", "find", "head", "tail"].flatMap((c) => [
    `Bash(${c}:*)`,
    `PowerShell(${c}:*)`,
  ]),
];

async function agent(task, dir) {
  const started = Date.now();
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    model,
    "--mcp-config",
    ".mcp.json",
    "--strict-mcp-config",
    // User-level settings, plugins and skills stay out, so the only debuff skills are the project's own.
    "--setting-sources",
    "project,local",
    // No permission bypass: file edits are accepted, and only the commands a debuff project needs are allowed.
    // Anything else is denied (there's no one to ask), and the denial shows in the transcript.
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    ALLOWED.join(","),
    "--max-budget-usd",
    budget,
    "--no-session-persistence",
  ];
  const r = await run("claude", args, { cwd: dir, input: task.prompt, ms: timeout });
  writeFileSync(join(dir, ".eval-transcript.jsonl"), r.stdout);
  writeFileSync(join(dir, ".eval-stderr.txt"), r.stderr);
  return { ms: Date.now() - started, status: r.status };
}

function collect(dir) {
  sh("git", ["add", "-A", "--", ".", ":!.eval-*"], dir, { env: gitEnv });
  const diff = sh("git", ["diff", "--cached", "HEAD"], dir).stdout ?? "";
  const transcript = readFileSync(join(dir, ".eval-transcript.jsonl"), "utf8");
  return { ...parseTranscript(transcript), diff };
}

function outcome(task, dir, result) {
  if (typeof task.outcome === "function") return task.outcome(result);
  if (task.outcome === "doctor+tests")
    return sh("npx", ["debuff", "doctor"], dir).status === 0 && sh("npx", ["debuff", "test"], dir).status === 0;
  if (!task.hidden) return null;
  const file = join(dir, "tests", "__eval_hidden.test.ts");
  cpSync(join(here, "hidden", task.hidden), file);
  const r = sh("npx", ["debuff", "test", "tests/__eval_hidden.test.ts"], dir);
  rmSync(file);
  return r.status === 0;
}

async function judge(task, result) {
  const verdicts = {};
  const reasons = {};
  for (const item of task.rubric.filter((i) => i.judge)) {
    const question = `You are grading a coding agent's final reply to a human. The human asked: "${task.prompt}"

Criterion: ${item.desc}

Give one sentence of reasoning, then on the last line write VERDICT: YES if the reply meets the criterion or VERDICT: NO if it doesn't.

The agent's final reply:
<<<
${result.final}
>>>`;
    const r = await run("claude", ["-p", "--model", JUDGE, "--setting-sources", "project", "--strict-mcp-config"], {
      cwd: tmpdir(),
      input: question,
      ms: 120_000,
    });
    // Reasoning first: asked for a bare YES/NO, haiku answered NO to a reply that offered three options and asked.
    const verdict = r.stdout.match(/VERDICT:\s*(YES|NO)/i)?.[1]?.toUpperCase();
    verdicts[item.id] = verdict === "YES" ? true : verdict === "NO" ? false : null;
    reasons[item.id] = r.stdout.trim();
  }
  return { verdicts, reasons };
}

async function one(base, task, condition, n) {
  const dir = join(work, "runs", `${task.id}-${condition}-${n}`);
  const saved = join(dir, ".eval-run.json");
  let meta = {};
  if (rescore) {
    if (!existsSync(saved)) return undefined;
    meta = JSON.parse(readFileSync(saved, "utf8"));
  } else {
    prepare(base, task, condition, dir);
    console.log(`start ${task.id} ${condition} #${n}`);
    meta = await agent(task, dir);
  }
  const result = collect(dir);
  if (!rescore) meta.outcome = outcome(task, dir, result);
  if (judging) ({ verdicts: meta.judge, reasons: meta.judgeReasons } = await judge(task, result));
  const scored = scoreRun(task, { ...result, judge: meta.judge });
  const record = {
    task: task.id,
    condition,
    n,
    model: meta.model ?? model,
    ms: meta.ms,
    status: meta.status,
    cost: result.cost,
    toolCalls: result.actions.length,
    skillCalls: result.actions.filter((a) => a.tool === "Skill").map((a) => a.input.skill),
    outcome: meta.outcome,
    judge: meta.judge,
    judgeReasons: meta.judgeReasons,
    ...scored,
  };
  writeFileSync(saved, JSON.stringify(record, null, 2));
  console.log(
    `done  ${task.id} ${condition} #${n}: score ${record.score?.toFixed(2)} outcome ${record.outcome} (${Math.round((meta.ms ?? 0) / 1000)}s)`,
  );
  return record;
}

// ---- main -------------------------------------------------------------------------------------------------

const base = rescore ? undefined : makeBase();
const jobs = [];
for (let n = 1; n <= runs; n++) for (const task of tasks) for (const condition of conditions) jobs.push([task, condition, n]);
const records = [];
await Promise.all(
  Array.from({ length: rescore ? 1 : parallel }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      try {
        const r = await one(base, ...job);
        if (r) records.push(r);
      } catch (err) {
        console.error(`failed ${job[0].id} ${job[1]} #${job[2]}: ${err.message}`);
      }
    }
  }),
);

const summary = {};
for (const task of tasks) {
  summary[task.id] = {};
  for (const condition of conditions) {
    const rs = records.filter((r) => r.task === task.id && r.condition === condition);
    const items = Object.fromEntries(
      task.rubric.map((item) => {
        const values = rs.map((r) => r.items.find((i) => i.id === item.id)?.pass).filter((v) => v !== null && v !== undefined);
        return [item.id, values.length ? `${values.filter(Boolean).length}/${values.length}` : "n/a"];
      }),
    );
    const outcomes = rs.map((r) => r.outcome).filter((v) => v !== null && v !== undefined);
    summary[task.id][condition] = {
      score: stats(rs.map((r) => r.score)),
      items,
      outcome: outcomes.length ? `${outcomes.filter(Boolean).length}/${outcomes.length}` : "n/a",
      cost: stats(rs.map((r) => r.cost)),
    };
  }
}
const overall = Object.fromEntries(conditions.map((c) => [c, stats(records.filter((r) => r.condition === c).map((r) => r.score))]));

const fmt = (s) => (s.mean === null ? "n/a" : `${s.mean.toFixed(2)} ± ${s.sd.toFixed(2)} (n=${s.n})`);
console.log(`\n| Task | ${conditions.join(" | ")} |\n| --- |${conditions.map(() => " --- |").join("")}`);
for (const task of tasks) console.log(`| ${task.id} | ${conditions.map((c) => fmt(summary[task.id][c].score)).join(" | ")} |`);
console.log(`| **all** | ${conditions.map((c) => fmt(overall[c])).join(" | ")} |`);

// A second run on the same day gets -2, -3…, so it never overwrites the first.
const stem = join(here, "results", `${new Date().toISOString().slice(0, 10)}-${model}`);
let out = `${stem}.json`;
for (let i = 2; existsSync(out); i++) out = `${stem}-${i}.json`;
mkdirSync(dirname(out), { recursive: true });
const claude = spawnSync("claude", ["--version"], { encoding: "utf8" }).stdout.trim();
writeFileSync(
  out,
  `${JSON.stringify(
    {
      date: new Date().toISOString(),
      model,
      claude,
      node: process.versions.node,
      platform: process.platform,
      runs,
      judged: records.some((r) => r.judge && Object.keys(r.judge).length > 0),
      overall,
      summary,
      runs_detail: records.sort((a, b) => a.task.localeCompare(b.task) || a.condition.localeCompare(b.condition) || a.n - b.n),
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${out}\ntranscripts and diffs: ${join(work, "runs")}`);
