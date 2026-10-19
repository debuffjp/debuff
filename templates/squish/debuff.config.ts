import { defineConfig } from "@debuffjp/cli";

export default defineConfig({
  // squish is portrait (360×640): run scenarios and fuzzing at that shape, so captures and contrast checks
  // see the game at full size instead of shrunk into a landscape window.
  scenarios: { viewport: [360, 640] },
});
