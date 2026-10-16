import pc from "picocolors";

/** debuff palette. Lime is the brand; the accents are for splashes of colour in tooling. */
export const PALETTE = {
  lime: "#a3e635",
  limeSoft: "#d9f99d",
  ink: "#11140d",
  sky: "#38bdf8",
  pink: "#f472b6",
  amber: "#fbbf24",
  violet: "#a78bfa",
  red: "#f87171",
} as const;

export type PaletteColor = keyof typeof PALETTE;

/** @deprecated Use PALETTE.lime. Kept for existing imports. */
export const LIME = { hex: PALETTE.lime, rgb: rgb(PALETTE.lime) };

const color = pc.isColorSupported;
const truecolor =
  color && (/truecolor|24bit/i.test(process.env.COLORTERM ?? "") || process.platform === "win32" || process.env.TERM_PROGRAM === "vscode");

/** Fallbacks for terminals without 24-bit colour. */
const BASIC: Record<PaletteColor, (s: string) => string> = {
  lime: pc.green,
  limeSoft: pc.greenBright,
  ink: pc.black,
  sky: pc.cyan,
  pink: pc.magenta,
  amber: pc.yellow,
  violet: pc.blue,
  red: pc.red,
};

/** Paint text in a palette colour. */
export function paint(name: PaletteColor, text: string): string {
  if (!color) return text;
  if (!truecolor) return BASIC[name](text);
  const [r, g, b] = rgb(PALETTE[name]);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

export const lime = (text: string) => paint("lime", text);
export const sky = (text: string) => paint("sky", text);
export const pink = (text: string) => paint("pink", text);
export const amber = (text: string) => paint("amber", text);
export const violet = (text: string) => paint("violet", text);

/** The ` debuff ` badge used in CLI headers. */
export function badge(text = " debuff "): string {
  if (!color) return `[${text.trim()}]`;
  if (!truecolor) return pc.bgGreen(pc.black(text));
  const [r, g, b] = rgb(PALETTE.lime);
  return `\x1b[48;2;${r};${g};${b}m${pc.black(pc.bold(text))}\x1b[49m`;
}

export type Mood = "idle" | "happy" | "oops";

/**
 * buff, the debuff mascot, as pixel art. Each string is a pixel row:
 * L lime, H highlight, K ink, R red (oops), . transparent.
 */
const BUFF: Record<Mood, string[]> = {
  idle: [".LLLLLL.", "LHHHHHHL", "LLKLLKLL", "LLKLLKLL", "LLLLLLLL", ".LLLLLL."],
  happy: [".LLLLLL.", "LHHHHHHL", "LKLKKLKL", "LLLLLLLL", "LLKKKKLL", ".LLLLLL."],
  oops: [".LLLLLL.", "LHHHHHHL", "LRLLLLRL", "LLRLLRLL", "LLLKKLLL", ".LLLLLL."],
};

const PIXEL: Record<string, string | undefined> = { L: PALETTE.lime, H: PALETTE.limeSoft, K: PALETTE.ink, R: PALETTE.red };

/**
 * buff rendered with half-block characters: two pixel rows per text line (3 lines tall).
 * Returns no lines when the terminal can't show 24-bit colour, so callers can just skip it.
 */
export function buff(mood: Mood = "idle"): string[] {
  if (!truecolor) return [];
  const rows = BUFF[mood];
  const lines: string[] = [];
  for (let y = 0; y < rows.length; y += 2) {
    const top = rows[y] ?? "";
    const bottom = rows[y + 1] ?? "";
    let line = "";
    for (let x = 0; x < top.length; x++) {
      const t = PIXEL[top[x] ?? "."];
      const b = PIXEL[bottom[x] ?? "."];
      if (!t && !b) line += " ";
      else if (t && b) line += `${fg(t)}${bg(b)}▀\x1b[0m`;
      else if (t) line += `${fg(t)}▀\x1b[0m`;
      else if (b) line += `${fg(b)}▄\x1b[0m`;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * buff beside up to three lines of text, for command headers and results.
 * Falls back to the badge and text when buff can't be drawn.
 */
export function banner(mood: Mood, lines: string[]): string {
  const art = buff(mood);
  if (!art.length) return [`${badge()} ${lines[0] ?? ""}`, ...lines.slice(1).map((l) => `         ${l}`)].join("\n");
  return art.map((row, i) => `  ${row}  ${lines[i] ?? ""}`).join("\n");
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const fg = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
};
const bg = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
};
