import { describe, expect, it } from "vitest";
import { reportPapercut } from "../src/papercut.js";

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
