// Anonymous build registration. After a successful `debuff build`, the CLI tells debuff.jp that a project was built,
// so we can find games made with debuff and later invite them to a showcase. It sends a random project id, the
// project's package.json name and the CLI version, and nothing else: no code, paths, URLs or player data.
// Off with `debuff telemetry off` or DEBUFF_TELEMETRY=0; skipped in CI. Details: https://debuff.jp/docs/telemetry
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const TELEMETRY_URL = "https://debuff.jp/api/telemetry";
export const TELEMETRY_DOCS = "https://debuff.jp/docs/telemetry";

interface UserConfig {
  telemetry?: boolean;
  /** The one-time notice has been shown. */
  telemetryNotice?: boolean;
}

export interface TelemetryContext {
  env?: NodeJS.ProcessEnv;
  /** Where the user config lives. Default: the OS config folder. */
  configFile?: string;
  fetch?: typeof fetch;
}

/** Per-user config: %APPDATA%\debuff on Windows, $XDG_CONFIG_HOME/debuff or ~/.config/debuff elsewhere. */
export function userConfigFile(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.APPDATA ?? env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "debuff", "config.json");
}

function readConfig(file: string): UserConfig {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as UserConfig;
  } catch {
    return {};
  }
}

function writeConfig(file: string, config: UserConfig): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  } catch {}
}

/** Why telemetry is off, or undefined when it's on. */
export function telemetryOff(ctx: TelemetryContext = {}): string | undefined {
  const env = ctx.env ?? process.env;
  const flag = (env.DEBUFF_TELEMETRY ?? "").toLowerCase();
  if (["0", "false", "off", "no"].includes(flag)) return "DEBUFF_TELEMETRY is off";
  if (env.CI && env.CI !== "false" && env.CI !== "0") return "running in CI";
  if (readConfig(ctx.configFile ?? userConfigFile(env)).telemetry === false) return "turned off with `debuff telemetry off`";
  return undefined;
}

export function setTelemetry(on: boolean, ctx: TelemetryContext = {}): void {
  const file = ctx.configFile ?? userConfigFile(ctx.env ?? process.env);
  writeConfig(file, { ...readConfig(file), telemetry: on, telemetryNotice: true });
}

/** The project's random id, made once and kept in `.debuff/project.json` (which projects don't commit). */
export function projectId(root: string): string {
  const file = join(root, ".debuff", "project.json");
  try {
    const id = (JSON.parse(readFileSync(file, "utf8")) as { id?: unknown }).id;
    if (typeof id === "string" && /^[a-z0-9-]{8,64}$/.test(id)) return id;
  } catch {}
  const id = randomUUID();
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ id }, null, 2)}\n`);
  } catch {}
  return id;
}

export interface BuildPing {
  id: string;
  name: string;
  debuff: string;
}

/** What `debuff build` would send for this project, or undefined for projects it never reports (debuff's own). */
export function buildPing(root: string, version: string): BuildPing | undefined {
  const pkgFile = join(root, "package.json");
  if (!existsSync(pkgFile)) return undefined;
  let name = "";
  try {
    name = String((JSON.parse(readFileSync(pkgFile, "utf8")) as { name?: unknown }).name ?? "");
  } catch {}
  // debuff's own templates and examples build in its repo and CI all the time.
  if (!name || name.startsWith("@debuffjp/")) return undefined;
  return { id: projectId(root), name: name.slice(0, 100), debuff: version };
}

/**
 * Register a build, unless telemetry is off. Shows a one-time notice through `notice` first. Never throws and
 * never waits more than about a second and a half, so it can't slow down or break a build.
 */
export async function reportBuild(
  root: string,
  version: string,
  notice: (text: string) => void,
  ctx: TelemetryContext = {},
): Promise<void> {
  const env = ctx.env ?? process.env;
  if (telemetryOff(ctx)) return;
  const ping = buildPing(root, version);
  if (!ping) return;
  const file = ctx.configFile ?? userConfigFile(env);
  const config = readConfig(file);
  if (!config.telemetryNotice) {
    notice(
      `debuff registers builds anonymously (a random project id, its package name and the debuff version) so we can find games made with it. Nothing else is sent. Turn it off with \`debuff telemetry off\` or DEBUFF_TELEMETRY=0. More: ${TELEMETRY_DOCS}`,
    );
    writeConfig(file, { ...config, telemetryNotice: true });
  }
  try {
    await (ctx.fetch ?? fetch)(env.DEBUFF_TELEMETRY_URL ?? TELEMETRY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ping),
      signal: AbortSignal.timeout(1500),
    });
  } catch {}
}
