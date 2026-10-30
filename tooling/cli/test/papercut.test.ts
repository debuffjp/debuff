import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { autoPapercut, failureSignal, papercutsOff, reportPapercut, setPapercuts, slowSignal } from "../src/papercut.js";

function fake(status: number, data: unknown) {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(data), { status });
  }) as unknown as typeof globalThis.fetch;
  return { sent, fetch };
}

const entry = {
  id: 7,
  title: "vitest times out",
  repo: "debuff",
  area: "",
  kind: "flaky",
  status: "open",
  workaround: "",
  hits: 2,
  minutes: 15,
};

describe("reportPapercut", () => {
  it("files a report with the reporter and the token", async () => {
    const { sent, fetch } = fake(201, { entry });
    const r = await reportPapercut(
      { title: "vitest times out", kind: "flaky", minutes: 5 },
      { reporter: "debuff-cli 1.0.0", fetch, env: { DEBUFF_PAPERCUTS_TOKEN: "t", DEBUFF_PAPERCUTS_URL: "http://x/" } },
    );
    expect(r).toMatchObject({ action: "filed", url: "http://x/#7", pending: false });
    expect(sent[0]?.url).toBe("http://x/api/report");
    expect(((sent[0]?.init.headers ?? {}) as Record<string, string>).authorization).toBe("Bearer t");
    expect(JSON.parse(String(sent[0]?.init.body))).toMatchObject({
      title: "vitest times out",
      repo: "debuff",
      reporter: "debuff-cli 1.0.0",
      force: false,
    });
  });

  it("returns similar entries instead of filing a duplicate", async () => {
    const { fetch } = fake(409, { similar: [{ entry, score: 0.7 }] });
    const r = await reportPapercut({ title: "vitest timed out again" }, { reporter: "x", fetch, env: {} });
    expect(r).toEqual({ action: "similar", similar: [{ entry, score: 0.7 }] });
  });

  it("adds a hit, and sends no token when there is none", async () => {
    const { sent, fetch } = fake(200, { entry, reopened: false });
    const r = await reportPapercut({ title: "", hit: 7, minutes: 10, body: "again" }, { reporter: "x", fetch, env: {} });
    expect(r.action).toBe("hit");
    expect(sent[0]?.url).toBe("https://papercuts.debuff.jp/api/entries/7/hit");
    expect(((sent[0]?.init.headers ?? {}) as Record<string, string>).authorization).toBeUndefined();
  });

  it("throws the board's error", async () => {
    const { fetch } = fake(400, { error: "title: too short" });
    await expect(reportPapercut({ title: "x" }, { reporter: "x", fetch, env: {} })).rejects.toThrow("title: too short");
  });
});

describe("autoPapercut", () => {
  const signal = {
    fingerprint: "cli:build:browser_not_found",
    title: "cli build fails with browser_not_found",
    kind: "confusing" as const,
    area: "cli:build",
  };
  const dir = () => mkdtempSync(join(tmpdir(), "debuff-papercuts-"));

  it("sends on the second sighting, once a day, with the notice the first time", async () => {
    const { sent, fetch } = fake(201, { entry: { ...entry, status: "pending" } });
    const notices: string[] = [];
    const ctx = { reporter: "debuff-cli 1.0.0", fetch, env: {}, configDir: dir(), notice: (t: string) => notices.push(t) };
    expect(await autoPapercut(signal, { ...ctx, now: 1000 })).toBeUndefined();
    expect(await autoPapercut(signal, { ...ctx, now: 2000 })).toMatchObject({ action: "filed", pending: true });
    expect(await autoPapercut(signal, { ...ctx, now: 3000 })).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(notices).toHaveLength(1);
    const body = JSON.parse(String(sent[0]?.init.body));
    expect(body).toEqual({
      title: signal.title,
      repo: "debuff",
      area: "cli:build",
      kind: "confusing",
      minutes: 0,
      reporter: "debuff-cli 1.0.0",
      fingerprint: signal.fingerprint,
      auto: true,
    });
    expect(await autoPapercut(signal, { ...ctx, now: 3000 + 86_400_000 })).toMatchObject({ action: "filed" });
  });

  it("stays off in CI, with DEBUFF_PAPERCUTS=0 and after `papercuts off`", async () => {
    const { sent, fetch } = fake(201, { entry });
    const once = { ...signal, minSeen: 1 };
    await autoPapercut(once, { reporter: "x", fetch, env: { CI: "true" }, configDir: dir() });
    await autoPapercut(once, { reporter: "x", fetch, env: { DEBUFF_PAPERCUTS: "0" }, configDir: dir() });
    const off = dir();
    setPapercuts(false, {}, off);
    expect(papercutsOff({}, off)).toContain("papercuts off");
    await autoPapercut(once, { reporter: "x", fetch, env: {}, configDir: off });
    expect(sent).toHaveLength(0);
  });

  it("never throws when the board is down", async () => {
    const fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof globalThis.fetch;
    expect(await autoPapercut({ ...signal, minSeen: 1 }, { reporter: "x", fetch, env: {}, configDir: dir() })).toBeUndefined();
  });

  it("skips usage and network failures, and fast runs", () => {
    expect(failureSignal("cli:build", "bad_option", 3)).toBeUndefined();
    expect(failureSignal("cli:build", "network", 1)).toBeUndefined();
    expect(failureSignal("mcp:game_start", "dev_hooks_missing", 2)?.fingerprint).toBe("mcp:game_start:dev_hooks_missing");
    expect(slowSignal("cli:build", 30, 180)).toBeUndefined();
    expect(slowSignal("cli:build", 400, 180)).toMatchObject({ fingerprint: "cli:build:slow", minutes: 7 });
  });
});
