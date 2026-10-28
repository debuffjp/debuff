import { existsSync, readdirSync, readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Tests import other debuff packages by name. Point those imports at src/ so tests never run against a
// stale or missing dist/ (the pre-push hook runs tsc and vitest at the same time).
const alias = ["packages", "tooling"].flatMap((group) =>
  readdirSync(group).flatMap((dir) => {
    const path = `${group}/${dir}`;
    if (!existsSync(`${path}/package.json`)) return [];
    const pkg = JSON.parse(readFileSync(`${path}/package.json`, "utf8"));
    return Object.entries<string | Record<string, string>>(pkg.exports ?? {}).flatMap(([sub, target]) => {
      const file = typeof target === "string" ? target : (target.default ?? target.import);
      const src = file?.match(/^\.\/dist\/(.*)\.js$/)?.[1];
      if (!src) return [];
      const name = sub === "." ? pkg.name : `${pkg.name}/${sub.slice(2)}`;
      return [{ find: new RegExp(`^${name.replace(/[/.]/g, "\\$&")}$`), replacement: `${import.meta.dirname}/${path}/src/${src}.ts` }];
    });
  }),
);

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { test: { name: "runtime", include: ["packages/*/test/**/*.test.ts"], environment: "happy-dom" } },
      {
        test: {
          name: "tooling",
          include: ["tooling/*/test/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/fixture/**", "**/fixture-*/**"],
          environment: "node",
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "tooling/*/src/**"],
      // Entry points and code that only runs in a real browser or TTY. These are covered end to end
      // by `npm run test:scenarios` (WebGL2, scenario runner) and the MCP test (live game session), which
      // execute built output and so don't count toward source coverage.
      exclude: [
        "**/src/cli.ts",
        "tooling/create-debuff/src/interactive.ts",
        "tooling/cli/src/scenario/browser.ts",
        "tooling/cli/src/scenario/run.ts",
        // Drives a real browser; covered end to end by the MCP server test (`fuzz` tool).
        "tooling/cli/src/fuzz.ts",
        "tooling/mcp/src/session.ts",
      ],
      reporter: ["text-summary", "html"],
      // Floor, not target: raise as coverage grows. Scenario runner and CLI entry are covered end-to-end by `npm run test:scenarios`.
      thresholds: { lines: 80, functions: 75, branches: 60, statements: 78 },
    },
  },
});
