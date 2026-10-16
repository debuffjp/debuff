import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "runtime", include: ["packages/*/test/**/*.test.ts"], environment: "happy-dom" } },
      { test: { name: "tooling", include: ["tooling/*/test/**/*.test.ts"], environment: "node" } },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "tooling/*/src/**"],
      exclude: ["tooling/cli/src/cli.ts", "tooling/create-debuff/src/cli.ts", "tooling/cli/src/scenario/browser.ts"],
      reporter: ["text-summary", "html"],
      // Floor, not target: raise as coverage grows. Scenario runner and CLI entry are covered end-to-end by `npm run test:scenarios`.
      thresholds: { lines: 70, functions: 70, branches: 55, statements: 68 },
    },
  },
});
