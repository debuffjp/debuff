/** Whose problem an error is, so the fix starts in the right place. */
export type ErrorKind =
  /** Thrown from the game's own code. */
  | "your-code"
  /** debuff rejected a call from the game's code (bad argument, unknown id…); the message says why. */
  | "debuff-usage"
  /** An unexpected failure inside debuff itself: please report it. */
  | "debuff-bug"
  /** No frame from this page: a browser extension, another script or the browser. */
  | "outside";

export interface SourceLocation {
  /** Path relative to the dev server, e.g. `src/main.ts`. */
  file: string;
  line: number;
  column: number;
  /** The function name, when the stack has one. */
  fn?: string;
}

/** A runtime error explained for humans and agents. JSON-serialisable. */
export interface ExplainedError {
  kind: ErrorKind;
  name: string;
  message: string;
  /** Where in the game's code to look: the throwing frame, or the call into debuff that failed. */
  where?: SourceLocation;
  /** A plain-words next step. */
  hint: string;
  /** Loop phase and tick, when the game loop caught it. */
  phase?: string;
  scene?: string;
  tick?: number;
  /** How many times this same error happened. */
  count: number;
  stack: string;
  /** For `debuff-bug`: a prefilled GitHub issue. */
  reportUrl?: string;
}

const ISSUES = "https://github.com/debuffjp/debuff/issues/new";

interface Frame extends SourceLocation {
  debuff: boolean;
  thirdParty: boolean;
  sameOrigin: boolean;
}

/**
 * Explain an error from its stack: whose code threw, where to look, and what to try.
 * Heuristic but conservative: when unsure it says so instead of guessing.
 */
export function explainError(
  error: unknown,
  context: { phase?: string; scene?: string | undefined; tick?: number } = {},
  origin = typeof location === "undefined" ? "" : location.origin,
): ExplainedError {
  const err = error instanceof Error ? error : undefined;
  const name = err?.name ?? "Error";
  const message = err?.message ?? String(error);
  const stack = err?.stack ?? `${name}: ${message}`;
  const frames = parseStack(stack, origin);
  const top = frames.find((f) => f.sameOrigin);
  const yours = frames.find((f) => f.sameOrigin && !f.debuff && !f.thirdParty);
  const base = {
    name,
    message,
    count: 1,
    stack,
    ...(context.phase === undefined ? {} : { phase: context.phase }),
    ...(context.scene === undefined ? {} : { scene: context.scene }),
    ...(context.tick === undefined ? {} : { tick: context.tick }),
  };
  const at = (f: Frame | undefined) => (f ? { where: strip(f) } : {});

  if (!top) {
    return {
      ...base,
      kind: "outside",
      hint: "No frame from this game in the stack: likely a browser extension or another script. Try a private window.",
    };
  }
  if (!top.debuff) {
    if (top.thirdParty) {
      return {
        ...base,
        kind: "your-code",
        ...at(yours ?? top),
        hint: `Thrown inside a dependency (${top.file}). Check what your code passed to it${yours ? ` at ${loc(yours)}` : ""}.`,
      };
    }
    return { ...base, kind: "your-code", ...at(top), hint: hintFor(name, message, top) };
  }
  // Thrown inside debuff. Its deliberate errors are plain `Error`s with a message that says what to do;
  // a TypeError/RangeError/ReferenceError from inside debuff is a bug in debuff.
  const deliberate = name === "Error";
  if (deliberate) {
    return {
      ...base,
      kind: "debuff-usage",
      ...at(yours),
      hint: yours
        ? `debuff rejected a call from ${loc(yours)}. The message says what it expected.`
        : "debuff rejected a call. The message says what it expected.",
    };
  }
  const title = `${name}: ${message}`.slice(0, 120);
  const body = [
    "**What happened**",
    "",
    `\`${name}: ${message}\`${context.phase ? ` during \`${context.phase}\`` : ""}`,
    "",
    "**Stack**",
    "",
    "```",
    stack.split("\n").slice(0, 15).join("\n"),
    "```",
    "",
    `**Browser**: ${typeof navigator === "undefined" ? "unknown" : navigator.userAgent}`,
  ].join("\n");
  return {
    ...base,
    kind: "debuff-bug",
    ...at(yours ?? top),
    hint: `This looks like a bug in debuff (${top.file}), not in your code. Please report it.`,
    reportUrl: `${ISSUES}?${new URLSearchParams({ title, body, labels: "bug" })}`,
  };
}

/** Same error, same place: used to collapse repeats (a broken update throws every frame). */
export function errorKey(e: ExplainedError): string {
  return `${e.name}|${e.message}|${e.where ? loc(e.where) : ""}`;
}

export function loc(l: SourceLocation): string {
  return `${l.file}:${l.line}:${l.column}`;
}

function strip(f: Frame): SourceLocation {
  return { file: f.file, line: f.line, column: f.column, ...(f.fn ? { fn: f.fn } : {}) };
}

/** Parse V8 (`at fn (url:1:2)`) and Firefox/Safari (`fn@url:1:2`) stack lines. */
function parseStack(stack: string, origin: string): Frame[] {
  const frames: Frame[] = [];
  for (const raw of stack.split("\n")) {
    const lineText = raw.trim();
    const m = /^at (?:(.*?) \()?(.+?):(\d+):(\d+)\)?$/.exec(lineText) ?? /^(?:(.*?)@)?(.+?):(\d+):(\d+)$/.exec(lineText);
    if (!m?.[2]) continue;
    const url = m[2];
    let path = url;
    let sameOrigin = false;
    try {
      const u = new URL(url);
      sameOrigin = origin !== "" && u.origin === origin;
      path = decodeURIComponent(u.pathname);
    } catch {
      // Not a URL (node paths in tests): keep as is.
      sameOrigin = origin === "";
    }
    const file = path.replace(/^\/(@fs\/)?/, "");
    const debuff = /(^|\/)@debuffjp[/_]|\.vite\/deps\/@debuffjp|\/packages\/(core|dev|input|audio|assets|tilemap|juice|ui)\//.test(path);
    const thirdParty = !debuff && /node_modules\//.test(path);
    frames.push({ file, line: Number(m[3]), column: Number(m[4]), debuff, thirdParty, sameOrigin, ...(m[1] ? { fn: m[1] } : {}) });
  }
  return frames;
}

function hintFor(name: string, message: string, where: Frame): string {
  const read = /(?:reading|setting) '([^']+)'|undefined \(evaluating '([^']+)'\)|can't access property "([^"]+)"/.exec(message);
  if (name === "TypeError" && read) {
    const prop = read[1] ?? read[2] ?? read[3];
    return `Something at ${loc(where)} is undefined when its \`${prop}\` is used. Common causes: an asset, map object or scene field that doesn't exist (yet), or a typo in an id. Check the state tab when it happens.`;
  }
  if (name === "TypeError" && /is not a function/.test(message)) {
    return `A value called as a function at ${loc(where)} isn't one. Check the name and that it's defined before this runs.`;
  }
  if (name === "ReferenceError") return `A name used at ${loc(where)} isn't defined. Check for typos or a missing import.`;
  if (name === "RangeError" && /call stack/i.test(message))
    return `Infinite recursion at ${loc(where)}: a function keeps calling itself (or a setter sets itself).`;
  return `Thrown from your code at ${loc(where)}.`;
}

const maps = new Map<string, Promise<string[][][] | undefined>>();

/**
 * Stacks point into the code the dev server serves (TypeScript already compiled). Map `e.where` back to
 * the original source line via the module's source map. Resolves true if the location changed.
 */
export async function mapLocation(e: ExplainedError, origin = typeof location === "undefined" ? "" : location.origin): Promise<boolean> {
  const where = e.where;
  if (!where || !origin) return false;
  const frame = rawFrames(e.stack).find((f) => f.file === where.file && f.line === where.line && f.column === where.column);
  if (!frame) return false;
  const mappings = await loadMappings(frame.url);
  const segments = mappings?.[where.line - 1];
  if (!segments?.length) return false;
  let best: string[] | undefined;
  for (const seg of segments) {
    if (Number(seg[0]) <= where.column - 1) best = seg;
    else break;
  }
  best ??= segments[0];
  if (!best || best.length < 4) return false;
  const before = loc(where);
  e.where = { ...where, line: Number(best[2]) + 1, column: Number(best[3]) + 1 };
  e.hint = e.hint.split(before).join(loc(e.where));
  return true;
}

function rawFrames(stack: string): { url: string; file: string; line: number; column: number }[] {
  const out: { url: string; file: string; line: number; column: number }[] = [];
  for (const raw of stack.split("\n")) {
    const t = raw.trim();
    const m = /^at (?:(.*?) \()?(.+?):(\d+):(\d+)\)?$/.exec(t) ?? /^(?:(.*?)@)?(.+?):(\d+):(\d+)$/.exec(t);
    if (!m?.[2]) continue;
    try {
      const u = new URL(m[2]);
      out.push({ url: m[2], file: decodeURIComponent(u.pathname).replace(/^\/(@fs\/)?/, ""), line: Number(m[3]), column: Number(m[4]) });
    } catch {
      // not a URL
    }
  }
  return out;
}

/** Decoded mappings as [genColumn, source, origLine, origColumn] per generated line (absolute values). */
function loadMappings(url: string): Promise<string[][][] | undefined> {
  let p = maps.get(url);
  if (!p) {
    p = (async () => {
      try {
        const code = await (await fetch(url)).text();
        const ref = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(code)?.[1];
        if (!ref) return undefined;
        const json = ref.startsWith("data:") ? atob(ref.slice(ref.indexOf(",") + 1)) : await (await fetch(new URL(ref, url))).text();
        return decodeMappings((JSON.parse(json) as { mappings: string }).mappings);
      } catch {
        return undefined;
      }
    })();
    maps.set(url, p);
  }
  return p;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** @internal Base64 VLQ source-map mappings → absolute segments per generated line. */
export function decodeMappings(mappings: string): string[][][] {
  const lines: string[][][] = [];
  let src = 0;
  let origLine = 0;
  let origCol = 0;
  for (const lineText of mappings.split(";")) {
    let genCol = 0;
    const segs: string[][] = [];
    for (const seg of lineText.split(",")) {
      if (!seg) continue;
      const v = vlq(seg);
      genCol += v[0] ?? 0;
      if (v.length >= 4) {
        src += v[1] ?? 0;
        origLine += v[2] ?? 0;
        origCol += v[3] ?? 0;
        segs.push([String(genCol), String(src), String(origLine), String(origCol)]);
      } else segs.push([String(genCol)]);
    }
    lines.push(segs);
  }
  return lines;
}

function vlq(s: string): number[] {
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (const ch of s) {
    const digit = B64.indexOf(ch);
    value += (digit & 31) << shift;
    if (digit & 32) shift += 5;
    else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}
