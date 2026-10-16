import { describe, expect, it } from "vitest";
import { explainError } from "../src/index.js";

const origin = "http://localhost:5173";
const err = (name: string, message: string, frames: string[]) => {
  const e = new Error(message);
  e.name = name;
  e.stack = [`${name}: ${message}`, ...frames.map((f) => `    at ${f}`)].join("\n");
  return e;
};

describe("explainError", () => {
  it("points at the game's own code, with a hint for undefined reads", () => {
    const e = explainError(
      err("TypeError", "Cannot read properties of undefined (reading 'x')", [
        "Object.update (http://localhost:5173/src/main.ts?t=1:42:7)",
        "Game.frame (http://localhost:5173/node_modules/.vite/deps/@debuff_core.js?v=1:900:3)",
      ]),
      { phase: "update", scene: "play", tick: 9 },
      origin,
    );
    expect(e).toMatchObject({
      kind: "your-code",
      where: { file: "src/main.ts", line: 42, column: 7, fn: "Object.update" },
      phase: "update",
      tick: 9,
    });
    expect(e.hint).toMatch(/`x` is used/);
  });

  it("blames the caller when debuff rejects a call on purpose", () => {
    const e = explainError(
      err("Error", 'Unknown scene "menu". Added: play', [
        "Game.go (http://localhost:5173/node_modules/.vite/deps/@debuff_core.js?v=1:200:11)",
        "start (http://localhost:5173/src/main.ts:10:6)",
      ]),
      {},
      origin,
    );
    expect(e).toMatchObject({ kind: "debuff-usage", where: { file: "src/main.ts", line: 10 } });
    expect(e.reportUrl).toBeUndefined();
  });

  it("flags unexpected failures inside debuff as debuff bugs with a report link", () => {
    const e = explainError(
      err("TypeError", "this.units is undefined", [
        "WebGL2Backend.flush (http://localhost:5173/node_modules/@debuff/core/dist/render/webgl2.js:280:5)",
        "loop (http://localhost:5173/src/main.ts:5:1)",
      ]),
      {},
      origin,
    );
    expect(e.kind).toBe("debuff-bug");
    expect(e.reportUrl).toMatch(/^https:\/\/github\.com\/debuffjp\/debuff\/issues\/new\?/);
  });

  it("parses Firefox/Safari stacks and recognises errors from outside the page", () => {
    const ff = new Error("nope");
    ff.stack = "update@http://localhost:5173/src/game.ts:3:9\n";
    expect(explainError(ff, {}, origin)).toMatchObject({
      kind: "your-code",
      where: { file: "src/game.ts", line: 3, column: 9, fn: "update" },
    });
    const ext = new Error("x");
    ext.stack = "Error: x\n    at chrome-extension://abc/content.js:1:1";
    expect(explainError(ext, {}, origin).kind).toBe("outside");
    expect(explainError("just a string", {}, origin).message).toBe("just a string");
  });
});

describe("decodeMappings", () => {
  it("decodes base64 VLQ into absolute segments", async () => {
    const { decodeMappings } = await import("../src/explain.js");
    // Line 1: col 0 → src 0, line 0, col 0. Line 2: col 2 → line 1, col 4 (relative +1, +4).
    expect(decodeMappings("AAAA;EACI")).toEqual([[["0", "0", "0", "0"]], [["2", "0", "1", "4"]]]);
  });
});
