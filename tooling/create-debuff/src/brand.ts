import pc from "picocolors";

/** Brand lime. Single source for terminal accents across debuff CLIs. */
export const LIME = { hex: "#a3e635", rgb: [163, 230, 53] as const };

const truecolor =
  pc.isColorSupported && /truecolor|24bit/i.test(process.env.COLORTERM ?? "") ? true : process.platform === "win32" && pc.isColorSupported;

/** Lime foreground (falls back to green where 24-bit colour isn't available). */
export function lime(text: string): string {
  if (!pc.isColorSupported) return text;
  if (!truecolor) return pc.green(text);
  const [r, g, b] = LIME.rgb;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

/** The ` debuff ` badge used in CLI headers. */
export function badge(text = " debuff "): string {
  if (!pc.isColorSupported) return `[${text.trim()}]`;
  if (!truecolor) return pc.bgGreen(pc.black(text));
  const [r, g, b] = LIME.rgb;
  return `\x1b[48;2;${r};${g};${b}m${pc.black(text)}\x1b[49m`;
}
