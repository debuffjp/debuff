import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * How the page embeds cross-origin files once isolated. `require-corp` (the default) works in every browser
 * but blocks any cross-origin file that doesn't send CORP or CORS headers. `credentialless` loads them
 * without cookies instead; Safari doesn't support it, so there the page simply isn't isolated.
 */
export type Embed = "require-corp" | "credentialless";

/** The response headers that make a page cross-origin isolated, so `SharedArrayBuffer` and worker threads work. */
export function isolationHeaders(embed: Embed): Record<string, string> {
  return {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": embed,
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

/**
 * Write the headers into `dist/_headers`, the file Cloudflare Pages, Cloudflare Workers static assets and Netlify
 * read. A `_headers` the project ships in `public/` is kept: the block is appended unless it already sets COEP.
 * Returns the file path, or `null` when the project's own file already isolates.
 */
export function writeHeadersFile(dist: string, embed: Embed): string | null {
  const file = join(dist, "_headers");
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (/cross-origin-embedder-policy/i.test(existing)) return null;
  const block = `/*\n${Object.entries(isolationHeaders(embed))
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n")}\n`;
  writeFileSync(file, existing ? `${existing.replace(/\n*$/, "\n\n")}${block}` : block);
  return file;
}
