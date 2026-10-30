/** Where `postIntent` drafts a post. */
export type PostTarget = "x" | "bluesky";

export interface PostDraft {
  text?: string;
  url?: string;
}

/** X's limit in weighted characters, and what every link costs (t.co shortens them all to 23). */
const X_LIMIT = 280;
const X_LINK = 23;
/** Bluesky's limit in graphemes. */
const BLUESKY_LIMIT = 300;
const ELLIPSIS = "…";

/**
 * A link that opens the X or Bluesky composer with a post drafted, for a devlog, release note or "play
 * my game" link. Nothing is posted: the person reviews and sends it. Text that would go over the
 * target's limit (280 weighted characters on X with links at 23, 300 graphemes on Bluesky) is cut with "…".
 *
 * ```ts
 * open(postIntent({ text: "Rope physics are in", url: "https://me.itch.io/game" }), "_blank");
 * ```
 */
export function postIntent(draft: PostDraft, to: PostTarget = "x"): string {
  const text = draft.text ?? "";
  if (to === "bluesky") {
    const suffix = draft.url ? `${text ? " " : ""}${draft.url}` : "";
    const fitted = fit(text, BLUESKY_LIMIT - graphemes(suffix).length, (s) => graphemes(s).length);
    return `https://bsky.app/intent/compose?text=${encodeURIComponent(fitted + suffix)}`;
  }
  // X appends `url` after a space.
  const room = X_LIMIT - (draft.url ? X_LINK + 1 : 0);
  const params = new URLSearchParams();
  if (text) params.set("text", fit(text, room, xWeight));
  if (draft.url) params.set("url", draft.url);
  return `https://x.com/intent/post?${params}`;
}

/**
 * X's weighted length (twitter-text v3): most Latin, Greek, Cyrillic and similar letters count 1, other code
 * points (CJK, emoji) count 2. Links typed into the text itself are counted as written, not as 23.
 */
export function xWeight(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    n += c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247) ? 1 : 2;
  }
  return n;
}

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl)
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return Array.from(text);
}

/** `text` cut at a grapheme boundary so it measures at most `limit`, with "…" when anything was dropped. */
function fit(text: string, limit: number, measure: (s: string) => number): string {
  if (measure(text) <= limit) return text;
  const parts = graphemes(text);
  let out = "";
  for (const part of parts) {
    if (measure(out + part + ELLIPSIS) > limit) break;
    out += part;
  }
  return out.trimEnd() + ELLIPSIS;
}
