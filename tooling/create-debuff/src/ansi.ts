/**
 * Terminal colours, without a dependency: the subset of picocolors debuff uses, with the same rules for
 * when colour is on (NO_COLOR and --no-color turn it off; FORCE_COLOR and --color turn it on; otherwise only an interactive TTY gets colour,
 * so piped output, logs and agents see plain text).
 */
const env = typeof process === "undefined" ? {} : process.env;
const argv = typeof process === "undefined" ? [] : process.argv;

export const isColorSupported =
  !("NO_COLOR" in env || argv.includes("--no-color")) &&
  ((env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0") ||
    argv.includes("--color") ||
    (typeof process !== "undefined" && process.stdout?.isTTY === true && env.TERM !== "dumb"));

/**
 * Wrap text in an SGR style. An inner close of the same kind (from nested styling) is replaced with
 * `replace`, so the outer style carries on after it.
 */
function style(open: string, close: string, replace = open): (text: string | number) => string {
  return (text) => {
    const s = String(text);
    if (!isColorSupported) return s;
    let at = s.indexOf(close, open.length);
    if (at < 0) return open + s + close;
    let out = "";
    let from = 0;
    while (at >= 0) {
      out += s.slice(from, at) + replace;
      from = at + close.length;
      at = s.indexOf(close, from);
    }
    return open + out + s.slice(from) + close;
  };
}

const sgr = (n: number) => `\x1b[${n}m`;

const pc = {
  isColorSupported,
  bold: style(sgr(1), sgr(22), sgr(22) + sgr(1)),
  dim: style(sgr(2), sgr(22), sgr(22) + sgr(2)),
  italic: style(sgr(3), sgr(23)),
  black: style(sgr(30), sgr(39)),
  red: style(sgr(31), sgr(39)),
  green: style(sgr(32), sgr(39)),
  yellow: style(sgr(33), sgr(39)),
  blue: style(sgr(34), sgr(39)),
  magenta: style(sgr(35), sgr(39)),
  cyan: style(sgr(36), sgr(39)),
  greenBright: style(sgr(92), sgr(39)),
  bgGreen: style(sgr(42), sgr(49)),
};

export default pc;
