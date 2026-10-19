/** Anything JSON can hold: a seed, a level id, a score to beat. */
export type ChallengeData = Record<string, string | number | boolean | null>;

/** Query parameter that carries a challenge. */
export const CHALLENGE_PARAM = "challenge";

function encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string): string {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/**
 * A link that opens this game with `data` attached, for "beat my run" sharing. Pair it with a seeded
 * `game.random` so the friend plays the same run.
 *
 * ```ts
 * const url = challengeLink({ seed: game.random.seed, score: 4200 });
 * ```
 *
 * The data is visible in the URL, so put game state in it, never anything personal.
 */
export function challengeLink(data: ChallengeData, base: string = location.href): string {
  const url = new URL(base);
  url.hash = "";
  url.searchParams.set(CHALLENGE_PARAM, encode(JSON.stringify(data)));
  return url.toString();
}

/** The challenge this page was opened with, or `undefined`. Malformed links read as no challenge. */
export function readChallenge<T extends ChallengeData = ChallengeData>(href: string = location.href): T | undefined {
  const value = new URL(href).searchParams.get(CHALLENGE_PARAM);
  if (!value) return undefined;
  try {
    const data: unknown = JSON.parse(decode(value));
    return data && typeof data === "object" && !Array.isArray(data) ? (data as T) : undefined;
  } catch {
    return undefined;
  }
}
