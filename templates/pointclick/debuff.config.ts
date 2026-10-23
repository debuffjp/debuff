import { defineConfig } from "@debuffjp/cli";

export default defineConfig({
  // Vite doesn't type-check, so `debuff dev` does after each save: type errors show in the dev overlay
  // and to agents while the game keeps running.
  typecheck: true,
});
