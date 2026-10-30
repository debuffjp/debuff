import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

// Runs before or after every edit and shell command an agent makes, so it imports nothing but node:fs and node:path.

export type HookAgent = "claude" | "codex";
export type HookEvent = "pre" | "post" | "stop";

/** One tool call or stop, normalised from the agent's stdin JSON. Paths are relative to the project, with `/`. */
export type HookAction =
  | { kind: "edit"; file: string; before?: string; after: string }
  | { kind: "shell"; command: string; background: boolean }
  | { kind: "stop"; continued: boolean; session: string };

export type HookRule =
  | "baselines"
  | "accept-saves"
  | "generated"
  | "foreground-dev"
  | "hand-bump"
  | "math-random"
  | "wall-clock"
  | "real-timers"
  | "untested";

export interface HookFinding {
  rule: HookRule;
  /** `ask` puts the call to the human (Codex can't, so it refuses); `warn` never blocks. */
  verdict: "refuse" | "ask" | "warn";
  message: string;
  fix: string;
  /** `file:line` for a warning about code. */
  where?: string;
}

const SOURCE = /^src\/.*\.(ts|tsx|js|jsx|mts|mjs)$/;

const CODE_RULES: { rule: HookRule; pattern: RegExp; message: string; fix: string }[] = [
  {
    rule: "math-random",
    pattern: /\bMath\.random\s*\(/,
    message: "Math.random isn't seeded in the browser, so replays, scenarios, fuzz findings and rewind stop matching the game",
    fix: "Use game.random (seeded from the game's `seed`): game.random.next(), .range(a, b), .int(a, b) or .pick(items)",
  },
  {
    rule: "wall-clock",
    pattern: /\bDate\.now\s*\(|\bperformance\.now\s*\(|\bnew Date\(\s*\)/,
    message: "Wall-clock time differs on every run, so replays, scenarios and headless tests can't reproduce it",
    fix: "Use game time: game.clock.time (seconds) or game.clock.tick",
  },
  {
    rule: "real-timers",
    pattern: /\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/,
    message: "Real timers run outside the game's fixed step, so they ignore pause, time scale, replays and `game.run()` in tests",
    fix: "Count game time in update(), or use Tweens from @debuffjp/juice",
  },
];

/** The lines an edit adds: lines in `after` that weren't in `before`. */
function addedLines(action: { before?: string; after: string }): { text: string; line: number }[] {
  const old = new Set((action.before ?? "").split("\n"));
  return action.after
    .split("\n")
    .map((text, i) => ({ text, line: i + 1 }))
    .filter((l) => !old.has(l.text));
}

const isComment = (text: string) => /^\s*(\/\/|\/?\*)/.test(text);

/** `@debuffjp/*` versions written in package.json text, by package name. */
function debuffVersions(text: string): Map<string, string> {
  return new Map([...text.matchAll(/"(@debuffjp\/[^"]+)"\s*:\s*"([^"]+)"/g)].map((m) => [m[1] as string, m[2] as string]));
}

/** Baselines and generated files, whichever tool writes them. */
function protectedPath(file: string): HookFinding[] {
  const found: HookFinding[] = [];
  if (file.startsWith("scenarios/__baselines__/"))
    found.push({
      rule: "baselines",
      verdict: "ask",
      message: "Screenshot baselines change only with the human's approval",
      fix: "Show the human the capture diff in .debuff/reports/ and let them run `npx debuff scenario --update`",
    });
  if (/^(\.debuff|dist)\//.test(file) || /(^|\/)node_modules\//.test(file))
    found.push({
      rule: "generated",
      verdict: "refuse",
      message: `${file} is generated or installed, so the next build or install overwrites it`,
      fix: "Change the source instead: src/, assets/, debuff.config.ts or package.json",
    });
  return found;
}

/** Files a shell command writes with `>`, `>>` or `tee`. Not `cp` or `mv`: catching the common case is enough. */
function writeTargets(command: string): string[] {
  const unquote = (s: string) => s.replace(/^["']|["']$/g, "");
  const redirects = [...command.matchAll(/(?<![0-9&])>>?\s*("[^"]+"|'[^']+'|[^\s;&|]+)/g)].map((m) => unquote(m[1] as string));
  const tees = [...command.matchAll(/\btee\s+(?:-a\s+)?("[^"]+"|'[^']+'|[^\s;&|]+)/g)].map((m) => unquote(m[1] as string));
  return [...redirects, ...tees].filter((t) => t !== "/dev/null" && t.toLowerCase() !== "nul");
}

/** A path relative to the project with `/`, from an absolute, relative or Git Bash (`/d/...`) path. */
function projectPath(root: string, file: string): string {
  const native = /^\/[a-z]\//i.test(file) && process.platform === "win32" ? `${file[1]}:${file.slice(2)}` : file;
  return (isAbsolute(native) ? relative(root, native) : native).replaceAll("\\", "/");
}

const DEV_SERVER =
  /(^|[;&|(]\s*|\s)(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?dev|(?:npx\s+)?debuff\s+dev|(?:npx\s+)?vite)(?=\s*$|\s*[;&|)]|\s+-)/;

/** What the rules say about one action, before or after it runs. Pure, apart from reading `root` for `pre` edits. */
export function checkAction(event: HookEvent, action: HookAction, root: string): HookFinding[] {
  const found: HookFinding[] = [];
  if (event === "pre" && action.kind === "edit") {
    const file = action.file;
    found.push(...protectedPath(file));
    if (file === "package.json") {
      const before = action.before ?? read(join(root, file));
      const old = debuffVersions(before);
      const changed = [...debuffVersions(action.after)].filter(([name, v]) => old.has(name) && old.get(name) !== v);
      if (changed.length)
        found.push({
          rule: "hand-bump",
          verdict: "refuse",
          message: `debuff packages are released together; changing ${changed.map(([n]) => n).join(", ")} by hand splits them`,
          fix: "Ask the human, then run `npx debuff upgrade` (or `--to <version>`), which moves them all and refreshes the skills",
        });
    }
  }
  if (event === "pre" && action.kind === "shell") {
    const command = action.command;
    for (const target of writeTargets(command)) found.push(...protectedPath(projectPath(root, target)));
    if (/\bdebuff\s+scenario\b.*--update\b/.test(command))
      found.push({
        rule: "baselines",
        verdict: "ask",
        message: "`scenario --update` replaces screenshot baselines, which needs the human's approval",
        fix: "Show the human the capture diff in .debuff/reports/ first",
      });
    if (/--accept-saves\b/.test(command))
      found.push({
        rule: "accept-saves",
        verdict: "ask",
        message: "Accepting a save change can lose players' progress unless Storage migrates it",
        fix: "Show the human what changed in saves.json and whether `new Storage(key, defaults, { version, migrate })` carries old saves over",
      });
    if (!action.background && DEV_SERVER.test(command) && !/\s&\s*$/.test(command))
      found.push({
        rule: "foreground-dev",
        verdict: "refuse",
        message: "The dev server never exits, so this would hang the shell",
        fix: "Run it in the background, or call the MCP `game_start` tool, which starts its own dev server",
      });
  }
  if (event === "post" && action.kind === "edit" && SOURCE.test(action.file)) {
    // An edit's lines count from its own first line; find where it landed in the file.
    const content = read(join(root, action.file));
    const at = content.indexOf(action.after);
    const offset = at < 0 ? 0 : content.slice(0, at).split("\n").length - 1;
    for (const { text, line: n } of addedLines(action)) {
      const line = n + offset;
      if (isComment(text)) continue;
      for (const r of CODE_RULES)
        if (r.pattern.test(text) && !new RegExp(`debuff-hook-ignore\\s+${r.rule}\\b`).test(text))
          found.push({ rule: r.rule, verdict: "warn", message: r.message, fix: r.fix, where: `${action.file}:${line}` });
    }
  }
  if (event === "stop" && action.kind === "stop" && !action.continued) {
    const edited = editedSince(root, action.session);
    if (edited)
      found.push({
        rule: "untested",
        verdict: "refuse",
        message: "src/ changed since the last `debuff test` run",
        fix: "Run `npx debuff test` (and `npm test` for visual changes) before finishing, or tell the human why you didn't",
      });
  }
  return found;
}

const read = (file: string) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

const EDITED = join(".debuff", "hook-edited");
const TESTED = join(".debuff", "last-test");

/** Record that `session` edited src/ (its mtime is the edit time), for the `untested` stop check. */
function markEdited(root: string, session: string): void {
  mkdirSync(join(root, ".debuff"), { recursive: true });
  writeFileSync(join(root, EDITED), session);
}

/** Record a finished `debuff test` or `debuff scenario` run, which clears the `untested` stop check. */
export function markTested(root: string): void {
  try {
    mkdirSync(join(root, ".debuff"), { recursive: true });
    writeFileSync(join(root, TESTED), `${new Date().toISOString()}\n`);
  } catch {}
}

function editedSince(root: string, session: string): boolean {
  try {
    if (readFileSync(join(root, EDITED), "utf8") !== session) return false;
    const edited = statSync(join(root, EDITED)).mtimeMs;
    return !existsSync(join(root, TESTED)) || statSync(join(root, TESTED)).mtimeMs < edited;
  } catch {
    return false;
  }
}

interface Payload {
  cwd?: string;
  session_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  stop_hook_active?: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Paths in an apply_patch body (Codex), with the lines each adds. */
function patchEdits(patch: string): { file: string; after: string }[] {
  const edits: { file: string; after: string[] }[] = [];
  for (const line of patch.split("\n")) {
    const header = /^\*\*\* (?:Add|Update) File: (.+)$/.exec(line);
    if (header) edits.push({ file: (header[1] as string).trim(), after: [] });
    else if (line.startsWith("+")) edits.at(-1)?.after.push(line.slice(1));
  }
  return edits.map((e) => ({ file: e.file, after: e.after.join("\n") }));
}

/** The actions in one hook payload: an apply_patch can touch several files. */
export function parsePayload(event: HookEvent, payload: Payload, root: string): HookAction[] {
  if (event === "stop") return [{ kind: "stop", continued: payload.stop_hook_active === true, session: payload.session_id ?? "" }];
  const input = payload.tool_input ?? {};
  const rel = (file: string) => projectPath(root, file);
  // The MCP run_scenarios tool can replace baselines too; check it as the command it stands for.
  if (payload.tool_name?.endsWith("run_scenarios"))
    return input.update === true ? [{ kind: "shell", command: "debuff scenario --update", background: false }] : [];
  const command = Array.isArray(input.command) ? input.command.join(" ") : str(input.command);
  const patch = Object.values(input).find((v): v is string => typeof v === "string" && v.includes("*** Begin Patch"));
  if (patch) return patchEdits(patch).map((e) => ({ kind: "edit", file: rel(e.file), after: e.after }));
  const file = str(input.file_path);
  if (file) {
    if (Array.isArray(input.edits))
      return (input.edits as Record<string, unknown>[]).map((e) => ({
        kind: "edit",
        file: rel(file),
        before: str(e.old_string) ?? "",
        after: str(e.new_string) ?? "",
      }));
    const after = str(input.new_string) ?? str(input.content);
    if (after !== undefined) {
      const before = str(input.old_string);
      return [{ kind: "edit", file: rel(file), after, ...(before !== undefined && { before }) }];
    }
  }
  if (command !== undefined) return [{ kind: "shell", command, background: input.run_in_background === true }];
  return [];
}

const text = (f: HookFinding) => `debuff hook (${f.rule})${f.where ? ` ${f.where}` : ""}: ${f.message}. ${f.fix}.`;

/** The agent's stdout for these findings: one JSON object, or nothing. The exit code is always 0. */
export function hookOutput(agent: HookAgent, event: HookEvent, findings: HookFinding[]): string {
  if (!findings.length) return "";
  if (event === "pre") {
    const blocking = findings.filter((f) => f.verdict !== "warn");
    if (!blocking.length) return "";
    const ask = agent === "claude" && blocking.every((f) => f.verdict === "ask");
    const reason = blocking.map((f) => (f.verdict === "ask" && !ask ? `Ask the human first. ${text(f)}` : text(f))).join("\n");
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: ask ? "ask" : "deny", permissionDecisionReason: reason },
    });
  }
  if (event === "post")
    return JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: findings.map(text).join("\n") } });
  return JSON.stringify({ decision: "block", reason: findings.map(text).join("\n") });
}

/**
 * The hook itself: `.claude/hooks/debuff.mjs <agent> <event>` calls this with the agent's JSON on stdin. Fails open: an
 * error here never blocks the agent. `DEBUFF_HOOK=0` turns it off.
 */
export function runHook(argv: string[], stdin = () => readFileSync(0, "utf8"), env = process.env): string {
  const [agent, event] = argv as [HookAgent, HookEvent];
  if (env.DEBUFF_HOOK === "0" || !["claude", "codex"].includes(agent) || !["pre", "post", "stop"].includes(event)) return "";
  try {
    const payload = JSON.parse(stdin()) as Payload;
    const root = env.CLAUDE_PROJECT_DIR ?? payload.cwd ?? process.cwd();
    const actions = parsePayload(event, payload, root);
    if (event === "post" && actions.some((a) => a.kind === "edit" && a.file.startsWith("src/"))) markEdited(root, payload.session_id ?? "");
    return hookOutput(
      agent,
      event,
      actions.flatMap((a) => checkAction(event, a, root)),
    );
  } catch {
    return "";
  }
}

/**
 * At session start, tell the agent when a newer debuff is out (at most once a day), so it can pass that on to the
 * human. Never rejects. Off with `DEBUFF_HOOK=0`, `DEBUFF_UPDATE_CHECK=0` or in CI.
 */
export async function sessionStart(env = process.env, options: { configFile?: string; fetch?: typeof fetch; now?: number } = {}) {
  if (env.DEBUFF_HOOK === "0") return "";
  try {
    const { upgradeNote } = await import("./versions.js");
    const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    const note = await upgradeNote(version, { env, ...options });
    return note ? JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: note } }) : "";
  } catch {
    return "";
  }
}

/** Entry point for the project shim. */
export function run(argv: string[]): void {
  if (argv[1] === "start") {
    void sessionStart().then((out) => out && process.stdout.write(out));
    return;
  }
  const out = runHook(argv);
  if (out) process.stdout.write(out);
}

/** The shim every project gets at `.claude/hooks/debuff.mjs`. It does nothing until the packages are installed. */
export const HOOK_SHIM = `// debuff's checks on an agent's edits and commands: https://debuff.jp/docs/agents#hook
// DEBUFF_HOOK=0 turns them off. Rules live in the installed @debuffjp/cli, so they follow the project's debuff version.
try {
  const { run } = await import("@debuffjp/cli/hook");
  run(process.argv.slice(2));
} catch {}
`;

const hookEntry = (agent: HookAgent, event: HookEvent | "start") => ({
  type: "command",
  command: `node .claude/hooks/debuff.mjs ${agent} ${event}`,
  timeout: 10,
});

// Only the tools a rule looks at, since each call starts a Node process (~0.3 s). After a call, only edits matter.
const config = (agent: HookAgent, edits: string, others: string) => ({
  hooks: {
    PreToolUse: [{ matcher: `^(${edits}|${others})$`, hooks: [hookEntry(agent, "pre")] }],
    PostToolUse: [{ matcher: `^(${edits})$`, hooks: [hookEntry(agent, "post")] }],
    Stop: [{ hooks: [hookEntry(agent, "stop")] }],
    SessionStart: [{ matcher: "startup", hooks: [hookEntry(agent, "start")] }],
  },
});

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The files that wire the hook into Claude Code and Codex, by path. Templates ship the same files. */
export function hookFiles(): Record<string, string> {
  return {
    ".claude/hooks/debuff.mjs": HOOK_SHIM,
    ".claude/settings.json": json(config("claude", "Edit|Write|MultiEdit", "Bash|mcp__.*__run_scenarios")),
    ".codex/hooks.json": json(config("codex", "apply_patch|Edit|Write", "Bash|shell|exec_command|.*run_scenarios")),
  };
}

const CONFIGS = { ".claude/settings.json": "claude", ".codex/hooks.json": "codex" } as const;

/** A config file that holds nothing but debuff's hooks, so rewriting it loses nothing of the user's. */
function onlyOurs(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const commands = [...JSON.stringify(parsed.hooks ?? {}).matchAll(/"command":"([^"]*)"/g)].map((m) => m[1] as string);
    return Object.keys(parsed).every((k) => k === "hooks") && commands.every((c) => c.includes(".claude/hooks/debuff.mjs"));
  } catch {
    return false;
  }
}

/**
 * Whether the project runs the debuff hook: `missing` without the shim or a config that calls it, `outdated` when a
 * config predates an event it should have (session start came in 0.24), else `current`.
 */
export function hookStatus(root: string): "missing" | "outdated" | "current" {
  if (!existsSync(join(root, ".claude/hooks/debuff.mjs"))) return "missing";
  const using = Object.entries(CONFIGS).filter(([file]) => read(join(root, file)).includes(".claude/hooks/debuff.mjs"));
  if (!using.length) return "missing";
  return using.every(([file, agent]) => read(join(root, file)).includes(`debuff.mjs ${agent} start`)) ? "current" : "outdated";
}

/** Whether the project runs the debuff hook at all. */
export const hookInstalled = (root: string) => hookStatus(root) !== "missing";

/**
 * Write the hook files that are missing, and refresh ones that hold only debuff's hooks. A settings file with the
 * user's own hooks or settings is left alone.
 */
export function writeHookFiles(root: string): string[] {
  const written: string[] = [];
  for (const [file, content] of Object.entries(hookFiles())) {
    const path = join(root, file);
    const existing = existsSync(path) ? read(path) : undefined;
    if (existing === content) continue;
    if (existing !== undefined && file !== ".claude/hooks/debuff.mjs" && !onlyOurs(existing)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    written.push(file);
  }
  return written;
}
