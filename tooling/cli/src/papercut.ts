// Papercuts: report tooling friction (a slow or flaky tool, a missing API, confusing docs) to the public board
// at papercuts.debuff.jp. Nothing is sent unless someone runs `debuff papercut` or calls the MCP tool; what's
// sent is the text they wrote plus the reporter name, never code, paths or project details. Guide:
// https://papercuts.debuff.jp/guide.md
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const PAPERCUTS_URL = "https://papercuts.debuff.jp";

export const PAPERCUT_REPOS = ["debuff", "keiko", "myaku", "spryte", "site", "other"] as const;
export const PAPERCUT_KINDS = ["slow", "flaky", "missing-api", "docs", "confusing", "broken", "other"] as const;

export interface PapercutEntry {
  id: number;
  title: string;
  repo: string;
  area: string;
  kind: string;
  status: string;
  workaround: string;
  hits: number;
  minutes: number;
}

export interface PapercutInput {
  /** The symptom, such as "vitest times out on tsc tests under load". */
  title: string;
  repo?: (typeof PAPERCUT_REPOS)[number] | undefined;
  /** A package, command or page: "cli test", "docs/assets". */
  area?: string | undefined;
  kind?: (typeof PAPERCUT_KINDS)[number] | undefined;
  /** Minutes it cost this time. */
  minutes?: number | undefined;
  body?: string | undefined;
  /** What got you unstuck. With `hit`, it fills the entry's workaround when it has none. */
  workaround?: string | undefined;
  /** Add a hit to this entry instead of filing a new one. `body` (or the title) becomes the hit's note. */
  hit?: number | undefined;
  /** File it even when similar entries exist. */
  force?: boolean | undefined;
}

export type PapercutResult =
  | { action: "filed"; entry: PapercutEntry; url: string; pending: boolean; hint: string }
  | { action: "hit"; entry: PapercutEntry; url: string; reopened: boolean; hint: string }
  | { action: "similar"; similar: { entry: PapercutEntry; score: number }[] };

/** The board's next step for an entry (its workaround, or that it waits for review). Empty from older boards. */
const hintOf = (data: Record<string, unknown>) => (typeof data.hint === "string" ? data.hint : "");

export interface PapercutContext {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  /** Who's reporting, such as "debuff-cli 0.23.0" or "debuff-mcp 0.23.0". */
  reporter: string;
}

/**
 * Files a papercut, or adds a hit to an existing one when `hit` is set. Returns the close matches instead
 * of filing when the board thinks it's a duplicate: hit one of them, or call again with `force`.
 * DEBUFF_PAPERCUTS_TOKEN (a reporter token) makes new entries show at once; without it they wait for review.
 */
export async function reportPapercut(input: PapercutInput, ctx: PapercutContext): Promise<PapercutResult> {
  const env = ctx.env ?? process.env;
  const base = (env.DEBUFF_PAPERCUTS_URL ?? PAPERCUTS_URL).replace(/\/+$/, "");
  const token = env.DEBUFF_PAPERCUTS_TOKEN;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const doFetch = ctx.fetch ?? fetch;
  const reporter = env.DEBUFF_PAPERCUTS_REPORTER ?? ctx.reporter;

  const send = async (path: string, body: unknown) => {
    const res = await doFetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    await settle();
    return { status: res.status, data };
  };

  if (input.hit !== undefined) {
    const { status, data } = await send(`/api/entries/${input.hit}/hit`, {
      minutes: input.minutes ?? 0,
      note: input.body ?? input.title,
      workaround: input.workaround ?? "",
      reporter,
    });
    if (status !== 200) throw new Error(`papercuts: ${String(data.error ?? `HTTP ${status}`)}`);
    const entry = data.entry as PapercutEntry;
    return { action: "hit", entry, url: `${base}/${entry.id}`, reopened: data.reopened === true, hint: hintOf(data) };
  }

  const { status, data } = await send("/api/report", {
    title: input.title,
    repo: input.repo ?? "debuff",
    area: input.area ?? "",
    kind: input.kind ?? "other",
    minutes: input.minutes ?? 0,
    body: input.body ?? "",
    workaround: input.workaround ?? "",
    reporter,
    force: input.force === true,
  });
  if (status === 409) return { action: "similar", similar: data.similar as { entry: PapercutEntry; score: number }[] };
  if (status !== 201) throw new Error(`papercuts: ${String(data.error ?? `HTTP ${status}`)}`);
  const entry = data.entry as PapercutEntry;
  return { action: "filed", entry, url: `${base}/${entry.id}`, pending: entry.status === "pending", hint: hintOf(data) };
}

// ---- automatic reports ----------------------------------------------------------------------------
// The CLI and the MCP server report their own pain without being asked: a setup failure that keeps
// happening, a command or tool call far slower than it should be. What's sent is a fixed title, a
// fingerprint (`cli:build:browser_missing`), the minutes and the reporter version: never messages, paths,
// code or project names. On the board these start `pending`, and a known fingerprint only adds a hit.
// Off with `debuff papercuts off`, DEBUFF_PAPERCUTS=0 or DEBUFF_TELEMETRY=0; skipped in CI.

/** Something a tool noticed. `fingerprint` must not contain anything from the user's project. */
export interface PapercutSignal {
  fingerprint: string;
  title: string;
  kind: (typeof PAPERCUT_KINDS)[number];
  area: string;
  minutes?: number | undefined;
  /** Times it must be seen within a week before it's sent. Default 2: a one-off isn't a papercut. */
  minSeen?: number | undefined;
}

export interface AutoPapercutContext extends PapercutContext {
  /** Where the per-user config and ledger live. Default: the OS config folder. */
  configDir?: string | undefined;
  /** Shown once, the first time anything is sent. */
  notice?: ((text: string) => void) | undefined;
  now?: number | undefined;
}

interface Ledger {
  [fingerprint: string]: { seen: number[]; sent?: number };
}

const DAY = 86_400_000;

/**
 * Lets the socket of a finished POST close before the CLI calls process.exit. Without it Node 24 on Windows
 * aborts on exit (libuv "UV_HANDLE_CLOSING" assertion) and the command exits 127.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

function configDir(env: NodeJS.ProcessEnv): string {
  return join(env.APPDATA ?? env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "debuff");
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  } catch {}
}

/** Why automatic papercuts are off, or undefined when they're on. */
export function papercutsOff(env: NodeJS.ProcessEnv = process.env, dir = configDir(env)): string | undefined {
  const off = (v: string | undefined) => ["0", "false", "off", "no"].includes((v ?? "").toLowerCase());
  if (off(env.DEBUFF_PAPERCUTS)) return "DEBUFF_PAPERCUTS is off";
  if (off(env.DEBUFF_TELEMETRY)) return "DEBUFF_TELEMETRY is off";
  if (env.CI && env.CI !== "false" && env.CI !== "0") return "running in CI";
  if (readJson<{ papercuts?: boolean }>(join(dir, "config.json"), {}).papercuts === false) return "turned off with `debuff papercuts off`";
  return undefined;
}

export function setPapercuts(on: boolean, env: NodeJS.ProcessEnv = process.env, dir = configDir(env)): void {
  const file = join(dir, "config.json");
  writeJson(file, { ...readJson<Record<string, unknown>>(file, {}), papercuts: on, papercutsNotice: true });
}

export const PAPERCUTS_NOTICE =
  "debuff reports its own papercuts (repeated setup failures, very slow commands) to papercuts.debuff.jp: a fixed title, an error code and the minutes, nothing from your project. Off with `debuff papercuts off`.";

/**
 * Records a signal and, when it has been seen often enough and wasn't sent in the last day, reports it.
 * Never throws and never waits more than 5 s. Returns what the board said, or undefined when nothing was sent.
 */
export async function autoPapercut(signal: PapercutSignal, ctx: AutoPapercutContext): Promise<PapercutResult | undefined> {
  try {
    const env = ctx.env ?? process.env;
    const dir = ctx.configDir ?? configDir(env);
    if (papercutsOff(env, dir)) return undefined;
    const now = ctx.now ?? Date.now();
    const ledgerFile = join(dir, "papercuts.json");
    const ledger = readJson<Ledger>(ledgerFile, {});
    const row = ledger[signal.fingerprint] ?? { seen: [] };
    row.seen = [...row.seen.filter((t) => now - t < 7 * DAY), now].slice(-20);
    ledger[signal.fingerprint] = row;
    // The notice comes before anything is sent: the first sighting shows it, and nothing goes out on that call
    // even when the signal is already due. Without a way to show it (no notice callback), nothing is sent.
    const configFile = join(dir, "config.json");
    const config = readJson<{ papercutsNotice?: boolean }>(configFile, {});
    const told = config.papercutsNotice === true;
    if (!told && ctx.notice) {
      ctx.notice(PAPERCUTS_NOTICE);
      writeJson(configFile, { ...config, papercutsNotice: true });
    }
    const due = told && row.seen.length >= (signal.minSeen ?? 2) && !(row.sent && now - row.sent < DAY);
    if (due) row.sent = now;
    // Drop fingerprints not seen for a month so the ledger stays small.
    for (const [k, v] of Object.entries(ledger)) if (now - (v.seen.at(-1) ?? 0) > 30 * DAY) delete ledger[k];
    writeJson(ledgerFile, ledger);
    if (!due) return undefined;
    const base = (env.DEBUFF_PAPERCUTS_URL ?? PAPERCUTS_URL).replace(/\/+$/, "");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (env.DEBUFF_PAPERCUTS_TOKEN) headers.authorization = `Bearer ${env.DEBUFF_PAPERCUTS_TOKEN}`;
    const res = await (ctx.fetch ?? fetch)(`${base}/api/report`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: signal.title,
        repo: "debuff",
        area: signal.area,
        kind: signal.kind,
        minutes: signal.minutes ?? 0,
        reporter: env.DEBUFF_PAPERCUTS_REPORTER ?? ctx.reporter,
        fingerprint: signal.fingerprint,
        auto: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json().catch(() => ({}))) as { entry?: PapercutEntry; reopened?: boolean; hint?: string };
    await settle();
    if (!data.entry) return undefined;
    const url = `${base}/${data.entry.id}`;
    const hint = hintOf(data);
    return res.status === 201
      ? { action: "filed", entry: data.entry, url, pending: data.entry.status === "pending", hint }
      : { action: "hit", entry: data.entry, url, reopened: data.reopened === true, hint };
  } catch {
    return undefined;
  }
}

/** Seconds after which a command counts as a slow papercut. Commands not listed are never "slow". */
export const SLOW_SECONDS: Record<string, number> = {
  build: 180,
  typecheck: 120,
  test: 120,
  scenario: 300,
  assets: 60,
  inspect: 30,
  doctor: 90,
  upgrade: 300,
};

/** The signal for a failed command or tool, or undefined for failures that are the user's to fix. */
export function failureSignal(where: string, code: string, exit: number, err?: unknown): PapercutSignal | undefined {
  // Usage errors are typos, a broken debuff.config.ts is the project's own, and a dropped network or an
  // empty project is not debuff's friction.
  if (exit === 3 || code === "network" || code === "nothing_to_run" || code === "config_invalid") return undefined;
  // Unexpected errors would all share one fingerprint per command: add where in debuff it was thrown.
  const site = code === "unexpected" ? `:${crashSite(err)}` : "";
  return {
    fingerprint: `${where}:${code}${site}`,
    title: `${where.replace(":", " ")} fails with ${code}${site ? ` (${site.slice(1)})` : ""}`,
    kind: code === "unexpected" ? "broken" : "confusing",
    area: where,
  };
}

/**
 * Where in debuff an error was thrown, as `TypeError@cli/vite.js:createDevServer`: the error's name and the
 * first stack frame inside a debuff package (its package and file, never the path to it). Line numbers are left
 * out so a fingerprint survives releases. `outside` when no frame is in debuff.
 */
export function crashSite(err: unknown): string {
  const name = err instanceof Error ? err.name.replace(/[^\w]/g, "") || "Error" : "Error";
  const stack = err instanceof Error ? (err.stack ?? "") : "";
  for (const line of stack.split("\n").slice(1)) {
    const m =
      /at (?:async )?(?:([\w$.<>]+) \()?.*?[\\/](?:@debuffjp[\\/]|tooling[\\/]|packages[\\/])([\w-]+)[\\/](?:dist|src)[\\/]([\w./\\-]+?)\.[jt]s:\d+/.exec(
        line,
      );
    if (m) return `${name}@${m[2]}/${(m[3] ?? "").replace(/\\/g, "/")}.js${m[1] ? `:${m[1].replace(/^Object\./, "")}` : ""}`;
  }
  return `${name}@outside`;
}

/** The signal for a command or tool that ran too long. */
export function slowSignal(where: string, seconds: number, limit: number): PapercutSignal | undefined {
  if (seconds < limit) return undefined;
  return {
    fingerprint: `${where}:slow`,
    title: `${where.replace(":", " ")} takes over ${limit} s`,
    kind: "slow",
    area: where,
    minutes: Math.round(seconds / 60),
  };
}
