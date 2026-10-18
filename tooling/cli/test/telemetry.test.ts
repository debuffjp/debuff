import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPing, projectId, reportBuild, setTelemetry, telemetryOff } from "../src/telemetry.js";

function project(name: string) {
  const root = mkdtempSync(join(tmpdir(), "debuff-telemetry-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name }));
  return root;
}

function setup(env: NodeJS.ProcessEnv = {}) {
  const configFile = join(mkdtempSync(join(tmpdir(), "debuff-config-")), "config.json");
  const sent: { url: string; body: unknown }[] = [];
  const notices: string[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(null, { status: 204 });
  }) as unknown as typeof globalThis.fetch;
  return { ctx: { env, configFile, fetch }, sent, notices, notice: (t: string) => notices.push(t) };
}

describe("telemetry", () => {
  it("registers a build with only a random id, the package name and the debuff version", async () => {
    const root = project("my-game");
    const { ctx, sent, notices, notice } = setup();
    await reportBuild(root, "0.7.2", notice, ctx);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://debuff.jp/api/telemetry");
    expect(Object.keys(sent[0]?.body as object).sort()).toEqual(["debuff", "id", "name"]);
    expect(sent[0]?.body).toMatchObject({ name: "my-game", debuff: "0.7.2" });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/debuff telemetry off/);
  });

  it("keeps the project's id between builds and shows the notice only once", async () => {
    const root = project("my-game");
    const { ctx, sent, notices, notice } = setup();
    await reportBuild(root, "0.7.2", notice, ctx);
    await reportBuild(root, "0.7.2", notice, ctx);
    const [first, second] = sent.map((s) => (s.body as { id: string }).id);
    expect(first).toBe(second);
    expect(projectId(root)).toBe(first);
    expect(notices).toHaveLength(1);
  });

  it("sends nothing when turned off, in CI, or for debuff's own templates", async () => {
    for (const env of [{ DEBUFF_TELEMETRY: "0" }, { DEBUFF_TELEMETRY: "off" }, { CI: "true" }]) {
      const { ctx, sent, notices, notice } = setup(env);
      await reportBuild(project("my-game"), "0.7.2", notice, ctx);
      expect(sent).toHaveLength(0);
      expect(notices).toHaveLength(0);
      expect(telemetryOff(ctx)).toBeTruthy();
    }
    const { ctx, sent, notice } = setup();
    setTelemetry(false, ctx);
    await reportBuild(project("my-game"), "0.7.2", notice, ctx);
    expect(sent).toHaveLength(0);
    expect(JSON.parse(readFileSync(ctx.configFile, "utf8"))).toMatchObject({ telemetry: false });
    expect(buildPing(project("@debuffjp/template-basic"), "0.7.2")).toBeUndefined();
  });

  it("never throws when the network fails", async () => {
    const { ctx, notice } = setup();
    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof globalThis.fetch;
    await expect(reportBuild(project("my-game"), "0.7.2", notice, { ...ctx, fetch: failing })).resolves.toBeUndefined();
  });
});
