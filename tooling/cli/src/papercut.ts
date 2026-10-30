// Papercuts: report tooling friction (a slow or flaky tool, a missing API, confusing docs) to the public board
// at papercuts.debuff.jp. Nothing is sent unless someone runs `debuff papercut` or calls the MCP tool; what's
// sent is the text they wrote plus the reporter name, never code, paths or project details. Guide:
// https://papercuts.debuff.jp/guide.md
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
  workaround?: string | undefined;
  /** Add a hit to this entry instead of filing a new one. */
  hit?: number | undefined;
  /** File it even when similar entries exist. */
  force?: boolean | undefined;
}

export type PapercutResult =
  | { action: "filed"; entry: PapercutEntry; url: string; pending: boolean }
  | { action: "hit"; entry: PapercutEntry; url: string; reopened: boolean }
  | { action: "similar"; similar: { entry: PapercutEntry; score: number }[] };

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
    return { status: res.status, data };
  };

  if (input.hit !== undefined) {
    const { status, data } = await send(`/api/entries/${input.hit}/hit`, {
      minutes: input.minutes ?? 0,
      note: input.body ?? input.title,
      reporter,
    });
    if (status !== 200) throw new Error(`papercuts: ${String(data.error ?? `HTTP ${status}`)}`);
    const entry = data.entry as PapercutEntry;
    return { action: "hit", entry, url: `${base}/#${entry.id}`, reopened: data.reopened === true };
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
  return { action: "filed", entry, url: `${base}/#${entry.id}`, pending: entry.status === "pending" };
}
