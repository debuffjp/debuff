import { readFileSync } from "node:fs";
import type { ToolingPlugin } from "../plugin.js";

type JsonObject = Record<string, unknown>;

/** The built-in scenario schema shipped as `@debuff/cli/schema/scenario.schema.json`. */
export function baseScenarioSchema(): JsonObject {
  return JSON.parse(readFileSync(new URL("../../schema/scenario.schema.json", import.meta.url), "utf8")) as JsonObject;
}

/** The scenario schema extended with every plugin's step types, for editors and agents. */
export function scenarioSchema(plugins: readonly ToolingPlugin[] = []): JsonObject {
  const schema = baseScenarioSchema();
  const defs = schema.$defs as { step: { oneOf: JsonObject[] } };
  for (const plugin of plugins) {
    for (const step of plugin.scenarioSteps ?? []) {
      const key = `${plugin.name}:${step.name}`;
      defs.step.oneOf.push({
        type: "object",
        required: [key],
        additionalProperties: false,
        properties: { [key]: { description: step.description, ...step.schema } },
      });
    }
  }
  return schema;
}
