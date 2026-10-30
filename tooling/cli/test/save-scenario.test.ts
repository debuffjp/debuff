import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { saveCapture, saveScenario } from "../src/agent-link.js";

describe("saveScenario", () => {
  it("writes to scenarios/ without overwriting", () => {
    const root = mkdtempSync(join(tmpdir(), "debuff-save-"));
    const scenario = { steps: [{ wait: 3 }, { capture: "boss" }] };
    expect(saveScenario(root, "boss", scenario)).toBe("scenarios/boss.json");
    expect(saveScenario(root, "boss", scenario)).toBe("scenarios/boss-2.json");
    expect(JSON.parse(readFileSync(join(root, "scenarios/boss.json"), "utf8"))).toEqual(scenario);
  });

  it("rejects unsafe names and non-scenarios", () => {
    const root = mkdtempSync(join(tmpdir(), "debuff-save-"));
    expect(() => saveScenario(root, "../escape", { steps: [] })).toThrow(/letters, digits/);
    expect(() => saveScenario(root, "ok", { nope: true })).toThrow(/steps array/);
  });
});

describe("saveCapture", () => {
  it("writes to .debuff/captures/ without overwriting", () => {
    const root = mkdtempSync(join(tmpdir(), "debuff-capture-"));
    const data = Buffer.from("fake mp4 bytes").toString("base64");
    expect(saveCapture(root, "clip-level1-300", "mp4", data)).toBe(".debuff/captures/clip-level1-300.mp4");
    expect(saveCapture(root, "clip-level1-300", "mp4", data)).toBe(".debuff/captures/clip-level1-300-2.mp4");
    expect(readFileSync(join(root, ".debuff/captures/clip-level1-300.mp4"), "utf8")).toBe("fake mp4 bytes");
  });

  it("rejects unsafe names, unknown types and empty data", () => {
    const root = mkdtempSync(join(tmpdir(), "debuff-capture-"));
    expect(() => saveCapture(root, "../escape", "mp4", "AA==")).toThrow(/letters, digits/);
    expect(() => saveCapture(root, "ok", "exe", "AA==")).toThrow(/Captures are/);
    expect(() => saveCapture(root, "ok", "png", "")).toThrow(/base64/);
  });
});
