// Turns a Claude Code stream-json transcript into an ordered list of actions, and scores a task's rubric against
// them. Scores come from what the agent did (its tool calls), never from what its summary says it did.
import { readFileSync } from "node:fs";

/**
 * One action per tool call, in order: `{ i, tool, mcp?, cmd?, file?, input }`.
 * `mcp` is the debuff MCP tool name without its prefix (`game_step`); `cmd` is a shell command line; `file` is the
 * path a file tool wrote, normalised to forward slashes.
 */
export function parseTranscript(text) {
  const actions = [];
  let final = "";
  let cost;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "result") {
      final = event.result ?? final;
      cost = event.total_cost_usd;
    }
    if (event.type !== "assistant") continue;
    for (const part of event.message?.content ?? []) {
      if (part.type !== "tool_use") continue;
      const input = part.input ?? {};
      const action = { i: actions.length, tool: part.name, input };
      const mcp = part.name.match(/^mcp__debuff__(.+)$/);
      if (mcp) action.mcp = mcp[1];
      if (part.name === "Bash" || part.name === "PowerShell") action.cmd = String(input.command ?? "");
      if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(part.name))
        action.file = String(input.file_path ?? input.notebook_path ?? "").replaceAll("\\", "/");
      actions.push(action);
    }
  }
  return { actions, final, cost };
}

// What counts as each behaviour. Shell and MCP routes are equivalent: `npx debuff test` and `run_tests` both count.
const cmd = (re) => (a) => a.cmd !== undefined && re.test(a.cmd);
const mcp =
  (...names) =>
  (a) =>
    names.includes(a.mcp);
const any =
  (...preds) =>
  (a) =>
    preds.some((p) => p(a));

export const is = {
  doctor: any(mcp("doctor"), cmd(/\bdebuff(\.js)?\s+doctor\b/)),
  tests: any(mcp("run_tests"), cmd(/\bdebuff(\.js)?\s+test\b|\bnpm\s+(run\s+)?test\b|\bnpm\s+t\b/)),
  scenarios: any(mcp("run_scenarios"), cmd(/\bdebuff(\.js)?\s+scenario\b|\bnpm\s+(run\s+)?test\b/)),
  /** Ran the game and looked at it: MCP game tools, or a logic test or scenario run (both play the real game). */
  played: any(
    mcp("game_start", "game_state", "game_step", "game_input", "game_capture", "game_profile", "game_frames", "game_replay"),
    cmd(/\bdebuff(\.js)?\s+(test|scenario|fuzz)\b|\bnpm\s+(run\s+)?test\b/),
  ),
  params: mcp("game_params", "game_set_param"),
  profiled: any(mcp("game_profile", "game_frames"), cmd(/\bmyaku\b|\bdebuff(\.js)?\s+profile\b/)),
  editSrc: (a) => a.file !== undefined && /\/src\//.test(a.file),
  editAssets: (a) => a.file !== undefined && /\/assets\//.test(a.file),
  editTests: (a) => a.file !== undefined && /\/(tests|scenarios)\/[^/]+$/.test(a.file),
  editPackage: (a) => a.file !== undefined && /\/package\.json$/.test(a.file),
  install: cmd(/\bnpm\s+(i|install|ci|add|dedupe)\b|\bpnpm\s+(i|install|add)\b|\byarn\s+add\b/),
  skill: (a) => a.tool === "Skill",
};

export const first = (actions, pred) => actions.find(pred)?.i ?? Number.POSITIVE_INFINITY;
export const last = (actions, pred) => actions.findLast(pred)?.i ?? Number.NEGATIVE_INFINITY;
export const some = (actions, pred) => actions.some(pred);

/** Lines added and removed by `git diff`, without the file headers. */
export function diffLines(diff) {
  const added = [];
  const removed = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added.push(line.slice(1));
    else if (line.startsWith("-")) removed.push(line.slice(1));
  }
  return { added, removed };
}

/**
 * Score one run. Each rubric item returns true, false, or null when it doesn't apply to what the agent did (a
 * "tests ran after the last edit" item when nothing was edited). `judge` items are only scored when a judge
 * verdict was collected for them.
 */
export function scoreRun(task, run) {
  const items = task.rubric.map((item) => {
    const value = item.judge ? (run.judge?.[item.id] ?? null) : item.check(run);
    return { id: item.id, judge: Boolean(item.judge), pass: value };
  });
  const scored = items.filter((i) => i.pass !== null);
  return { items, score: scored.length ? scored.filter((i) => i.pass).length / scored.length : null };
}

export function readRun(file) {
  return parseTranscript(readFileSync(file, "utf8"));
}

export function stats(values) {
  const xs = values.filter((v) => typeof v === "number");
  if (!xs.length) return { n: 0, mean: null, sd: null, min: null, max: null };
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1)) : 0;
  return { n: xs.length, mean, sd, min: Math.min(...xs), max: Math.max(...xs) };
}
