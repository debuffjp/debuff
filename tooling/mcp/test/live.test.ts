import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_PATHS, createDevServer, DEV_SERVER_FILE } from "@debuff/cli";
import { describe, expect, it } from "vitest";
import { LiveSession, startSession } from "../src/index.js";

/** A stand-in for a game page: listens on the agent link and answers commands. */
async function fakePage(base: string, answer: (method: string, args: unknown[]) => unknown) {
  const controller = new AbortController();
  const res = await fetch(new URL(AGENT_PATHS.events, base), { signal: controller.signal });
  const reader = res.body?.pipeThrough(new TextDecoderStream()).getReader();
  if (!reader) throw new Error("no stream");
  void (async () => {
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      buffer += value;
      let end = buffer.indexOf("\n\n");
      while (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");
        if (!block.startsWith("event: command")) continue;
        const { id, method, args } = JSON.parse(block.slice(block.indexOf("data: ") + 6));
        const body = method === "boom" ? { id, ok: false, error: "nope" } : { id, ok: true, result: answer(method, args) };
        await fetch(new URL(AGENT_PATHS.result, base), { method: "POST", body: JSON.stringify(body) });
      }
    }
  })();
  return () => controller.abort();
}

describe("live agent link", () => {
  it("relays calls from the MCP side to an open page and cleans up", async () => {
    const root = mkdtempSync(join(tmpdir(), "debuff-live-"));
    writeFileSync(join(root, "index.html"), "<!doctype html>");
    expect(await LiveSession.find(root)).toBeUndefined();

    const server = await createDevServer(root, { port: 0, logLevel: "silent", agentLink: true });
    await server.listen();
    try {
      expect(existsSync(join(root, DEV_SERVER_FILE))).toBe(true);
      // Running but no page open: auto mode must not pick live.
      expect(await LiveSession.find(root)).toBeUndefined();
      await expect(startSession(root, { mode: "live" })).rejects.toThrow(/No live game/);

      const base = server.resolvedUrls?.local[0] ?? "";
      const close = await fakePage(base, (method, args) => ({ method, args }));
      await new Promise((r) => setTimeout(r, 50));
      const live = await LiveSession.find(root);
      expect(live?.mode).toBe("live");
      expect(await live?.call("step", 3)).toEqual({ method: "step", args: [3] });
      await expect(live?.call("boom")).rejects.toThrow("nope");
      const status = async () => (await fetch(new URL(AGENT_PATHS.status, base))).json();
      expect(await status()).toMatchObject({ pages: 1, agents: 1 });
      await live?.stop();
      await new Promise((r) => setTimeout(r, 50));
      expect(await status()).toMatchObject({ agents: 0 });
      close();
    } finally {
      await server.close();
    }
    expect(existsSync(join(root, DEV_SERVER_FILE))).toBe(false);
  });
});
