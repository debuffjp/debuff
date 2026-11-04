import { defineConfig } from "vitest/config";
import { alias } from "../../vitest.config.ts";

// For `npx vitest run` in this folder, which doesn't read the root config. Keep it in step with the root's runtime project.
export default defineConfig({ resolve: { alias }, test: { include: ["test/**/*.test.ts"], environment: "happy-dom" } });
