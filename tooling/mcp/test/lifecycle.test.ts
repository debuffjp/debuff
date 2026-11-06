import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

// Sessions that take a while to start, like a headless browser plus a dev server, and record their stops.
const sessions: { id: number; stopped: boolean }[] = [];
vi.mock("../src/session.js", () => ({
  startSession: async () => {
    const s = { id: sessions.length + 1, stopped: false };
    sessions.push(s);
    await new Promise((r) => setTimeout(r, 30));
    return {
      mode: "headless" as const,
      url: `http://localhost/${s.id}`,
      call: async () => ({}),
      stop: async () => {
        s.stopped = true;
      },
    };
  },
}));

const { createServer } = await import("../src/server.js");

async function connect() {
  const server = createServer({ root: process.cwd(), version: "test" });
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
  return { server, client, call };
}

afterEach(() => {
  sessions.length = 0;
});

describe("game session lifecycle", () => {
  it("keeps one session when two game_start calls overlap", async () => {
    const { server, client, call } = await connect();
    await Promise.all([call("game_start", { mode: "headless" }), call("game_start", { mode: "headless" })]);
    expect(sessions.filter((s) => !s.stopped)).toHaveLength(1); // the other was stopped, not orphaned
    await client.close();
    await server.close();
    expect(sessions.every((s) => s.stopped)).toBe(true);
  });

  it("leaves no session when game_stop arrives while a start is in flight", async () => {
    const { server, client, call } = await connect();
    await Promise.all([call("game_start", { mode: "headless" }), call("game_stop")]);
    expect(sessions.filter((s) => !s.stopped)).toHaveLength(0);
    await client.close();
    await server.close();
  });
});
