import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { userConfigFile } from "./telemetry.js";

/** The registry document for the newest debuff release. The CLI's version is the whole group's (one `fixed` group). */
const LATEST = "https://registry.npmjs.org/@debuffjp/cli/latest";
const DAY = 24 * 60 * 60 * 1000;

/** True when `a` is a newer version than `b` (numeric parts; a prerelease sorts before its release). */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => {
    const [core = "", pre] = v.replace(/^[^\d]*/, "").split("-", 2);
    return { parts: core.split(".").map((n) => Number(n) || 0), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if ((x.parts[i] ?? 0) !== (y.parts[i] ?? 0)) return (x.parts[i] ?? 0) > (y.parts[i] ?? 0);
  return x.pre === undefined && y.pre !== undefined;
}

/** The newest published debuff version, or undefined when the registry can't be reached in time. */
export async function latestVersion(options: { fetch?: typeof fetch | undefined; timeoutMs?: number } = {}): Promise<string | undefined> {
  try {
    const res = await (options.fetch ?? fetch)(LATEST, { signal: AbortSignal.timeout(options.timeoutMs ?? 3000) });
    if (!res.ok) return undefined;
    const version = ((await res.json()) as { version?: unknown }).version;
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

interface UpdateState {
  updateCheckedAt?: number;
  latestVersion?: string;
}

/** Why the daily update hint is off, or undefined when it's on: off in CI and with DEBUFF_UPDATE_CHECK=0. */
export function updateCheckOff(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const flag = (env.DEBUFF_UPDATE_CHECK ?? "").toLowerCase();
  if (["0", "false", "off", "no"].includes(flag)) return "DEBUFF_UPDATE_CHECK is off";
  if (env.CI && env.CI !== "false" && env.CI !== "0") return "running in CI";
  return undefined;
}

/**
 * The one-line "newer debuff available" hint, checked at most once a day and remembered in the user config
 * file. Undefined when up to date, already checked today with nothing new, off, or offline.
 */
export async function updateHint(
  installed: string,
  options: { env?: NodeJS.ProcessEnv; configFile?: string; fetch?: typeof fetch; now?: number } = {},
): Promise<string | undefined> {
  const env = options.env ?? process.env;
  if (updateCheckOff(env)) return undefined;
  const file = options.configFile ?? userConfigFile(env);
  let config: Record<string, unknown> & UpdateState = {};
  try {
    config = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  const now = options.now ?? Date.now();
  // At most once a day: the run that checks is the run that says so.
  if (config.updateCheckedAt !== undefined && now - config.updateCheckedAt < DAY) return undefined;
  const latest = await latestVersion({ fetch: options.fetch, timeoutMs: 1500 });
  if (latest === undefined) return undefined;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ ...config, updateCheckedAt: now, latestVersion: latest }, null, 2)}\n`);
  } catch {}
  return isNewer(latest, installed) ? `debuff ${latest} is out (you have ${installed}): npx debuff upgrade` : undefined;
}

/**
 * What an agent is told at session start when a newer debuff is out (the hook's SessionStart), at most once a
 * day. It reuses the daily registry check when it's fresh, so most sessions make no network call.
 */
export async function upgradeNote(
  installed: string,
  options: { env?: NodeJS.ProcessEnv; configFile?: string; fetch?: typeof fetch; now?: number } = {},
): Promise<string | undefined> {
  const env = options.env ?? process.env;
  if (updateCheckOff(env)) return undefined;
  const file = options.configFile ?? userConfigFile(env);
  let config: Record<string, unknown> & UpdateState & { upgradeNotedAt?: number } = {};
  try {
    config = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  const now = options.now ?? Date.now();
  if (config.upgradeNotedAt !== undefined && now - config.upgradeNotedAt < DAY) return undefined;
  const fresh = config.updateCheckedAt !== undefined && now - config.updateCheckedAt < DAY;
  const latest = fresh ? config.latestVersion : await latestVersion({ fetch: options.fetch, timeoutMs: 1500 });
  if (latest === undefined || !isNewer(latest, installed)) return undefined;
  try {
    mkdirSync(dirname(file), { recursive: true });
    const checked = fresh ? {} : { updateCheckedAt: now, latestVersion: latest };
    writeFileSync(file, `${JSON.stringify({ ...config, ...checked, upgradeNotedAt: now }, null, 2)}\n`);
  } catch {}
  return `debuff ${latest} is out; this project has ${installed}. Tell the human once, with the changes that matter to them (https://github.com/debuffjp/debuff/blob/main/tooling/cli/CHANGELOG.md). If they want it, \`npx debuff upgrade\` moves every debuff package together and refreshes the skills and hooks. Don't upgrade without their go-ahead.`;
}
