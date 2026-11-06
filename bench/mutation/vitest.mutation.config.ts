// The Vitest config the Stryker run used: Stryker 10.1 doesn't support the root config's `test.projects`.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["packages/juice/test/**/*.test.ts"], environment: "happy-dom" },
});
