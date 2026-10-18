import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { saveScenario } from "../src/agent-link.js";

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
