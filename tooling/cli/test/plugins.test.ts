import { describe, expect, it } from "vitest";
import { baseScenarioSchema, scenarioSchema, type ToolingPlugin, validatePlugins } from "../src/index.js";

const plugin: ToolingPlugin = {
  name: "demo",
  apiVersion: 1,
  commands: [{ name: "greet", description: "Say hello", run: () => 0 }],
  scenarioSteps: [{ name: "expect-pops", description: "Assert pops", schema: { type: "integer" }, run: () => undefined }],
};

describe("plugin commands and steps", () => {
  it("accepts well-formed commands and steps", () => {
    expect(validatePlugins([plugin])).toHaveLength(1);
  });

  it("rejects entries without kebab-case names or run()", () => {
    expect(() => validatePlugins([{ ...plugin, commands: [{ name: "Greet", description: "", run: () => 0 }] }])).toThrow(
      /commands needs a kebab-case name/,
    );
    expect(() => validatePlugins([{ ...plugin, scenarioSteps: [{ name: "x", description: "", schema: {} } as never] }])).toThrow(
      /scenarioSteps needs a kebab-case name and a run\(\) function/,
    );
  });
});

describe("scenarioSchema", () => {
  it("adds namespaced plugin steps to the built-in step union", () => {
    const base = baseScenarioSchema() as { $defs: { step: { oneOf: unknown[] } } };
    const merged = scenarioSchema([plugin]) as {
      $defs: { step: { oneOf: { required?: string[]; properties?: Record<string, unknown> }[] } };
    };
    expect(merged.$defs.step.oneOf).toHaveLength(base.$defs.step.oneOf.length + 1);
    const added = merged.$defs.step.oneOf.at(-1);
    expect(added?.required).toEqual(["demo:expect-pops"]);
    expect(added?.properties?.["demo:expect-pops"]).toEqual({ description: "Assert pops", type: "integer" });
  });
});
