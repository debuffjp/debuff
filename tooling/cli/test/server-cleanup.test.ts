import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// A dev server that starts but reports no URL: runs fail before they launch a browser, the path a missing
// Chrome or a bad config also takes. The MCP server calls these in one long-lived process, so each leak stays.
const servers: { close: ReturnType<typeof vi.fn> }[] = [];
vi.mock("../src/vite.js", () => ({
  createDevServer: async () => {
    const server = { listen: async () => {}, close: vi.fn(async () => {}), resolvedUrls: undefined, httpServer: null };
    servers.push(server);
    return server;
  },
}));

const { runScenarios } = await import("../src/scenario/run.js");
const { runFuzz } = await import("../src/fuzz.js");

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  servers.length = 0;
});

function project(): string {
  dir = mkdtempSync(join(tmpdir(), "debuff-cleanup-"));
  mkdirSync(join(dir, "scenarios"));
  writeFileSync(join(dir, "scenarios", "smoke.json"), JSON.stringify({ steps: [{ wait: 1 }] }));
  return dir;
}

describe("dev server cleanup", () => {
  it("closes the scenario run's dev server when the run fails before the browser starts", async () => {
    await expect(runScenarios({ root: project(), files: [] })).rejects.toThrow(/without a URL/);
    expect(servers).toHaveLength(1);
    expect(servers[0]?.close).toHaveBeenCalled();
  });

  it("closes the fuzz run's dev server when the run fails before the browser starts", async () => {
    await expect(runFuzz({ root: project(), runs: 1, seconds: 1 })).rejects.toThrow(/URL/);
    expect(servers).toHaveLength(1);
    expect(servers[0]?.close).toHaveBeenCalled();
  });
});
