import { defineConfig } from "vite";

// Two pages: index.html (one renderer, driven by run.mjs or mobile.html) and mobile.html (self-running).
export default defineConfig({
  build: { rollupOptions: { input: { main: "index.html", mobile: "mobile.html" } } },
});
