import { defineConfig } from "vitest/config";

export default defineConfig({
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
