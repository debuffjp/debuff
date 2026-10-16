import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["{packages,tooling}/*/test/**/*.test.ts"] },
});
