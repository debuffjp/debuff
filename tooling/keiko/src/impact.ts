/**
 * Change-aware runs (`keiko --changed`): while tests run, record which code and files each one used; on a
 * later run, play only the tests whose code or files changed since they last passed in a named queue.
 *
 * What a test "used" comes from V8's function coverage, so a game whose every module loads in every test
 * still gets a short list: an edit inside a function a test never ran doesn't make it due. keiko runs are
 * deterministic (virtual clock, seeded random), so the same code runs the same functions again.
 *
 * A test is due when it's new, failed last time, the setup changed (lockfile, configs, keiko or Node), a
 * file it read changed, or a line of code it ran changed. Code changes are found by diffing the module as
 * Vite served it then and now, so type-only edits change nothing. Linked code outside the project root is
 * tracked like the game's own; code in node_modules isn't, and the lockfile stands in for it.
 *
 * @module
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ESModulesEvaluator,
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrExportNameKey,
  ssrImportKey,
  ssrImportMetaKey,
  ssrModuleExportsKey,
} from "vite/module-runner";

/** A span of a module's code, `[start, end)` in characters. */
export type Span = [number, number];

/** What one test used of one module. */
export interface ModuleUse {
  /** Hash of the module's code as Vite served it (source maps left out). */
  code: string;
  /** Hash of the source file on disk, to skip transforming files that didn't change. */
  file?: string;
  /** Spans of the code the test never ran, sorted and merged. */
  idle: Span[];
  /**
   * The module outlived one test (a test file, a helper it imports, a module an earlier test loaded), so a
   * change anywhere in it can reach this test through state: any change makes the test due.
   */
  shared?: true;
}

/** What one test used last time it ran in a queue. */
export interface TestUse {
  status: "pass" | "fail";
  /** By module id (an absolute path). */
  modules: Record<string, ModuleUse>;
  /** Files it read (pages, assets, replays) by `file:<path>` or `url:<path>`, with their hash. */
  inputs: Record<string, string>;
  /**
   * The setup hash (lockfile, configs, keiko and Node versions) when it last ran. Kept per test: a run of some
   * tests (a filter, named files) must not mark a setup change as seen for the tests it left out.
   */
  env?: string;
}

interface QueueFile {
  version: 1;
  /** Hash of what can change every test at once: lockfiles, configs, keiko and Node versions. */
  env: string;
  tests: Record<string, TestUse>;
}

/** Why a test runs in a `--changed` run, for `--json` and for people asking "why did this run?". */
/**
 * Why a test runs in a `--changed` run. `file`: another test in the same file is due, and tests in one file
 * can pass state to each other (a variable one sets and a later one reads), so a due file runs whole.
 */
export type DueReason = "new" | "failed" | "setup" | "code" | "input" | "file";

// ---- coverage ------------------------------------------------------------------------------------

interface CoverageRange {
  startOffset: number;
  endOffset: number;
  count: number;
}
interface ScriptCoverage {
  scriptId: string;
  url: string;
  functions: { functionName: string; ranges: CoverageRange[] }[];
}

/** Raw coverage for one module in one test: script offsets that didn't run, function ranges flagged. */
export interface RawUse {
  /** The script's length, or -1 for a module that ran without coverage: then all of it counts as used. */
  scriptLength: number;
  /** `[start, end, isFunction]` in script offsets. */
  idle: [number, number, boolean][];
  /** Functions that ran, in script offsets. V8 can report one inside an idle range (a class field initialiser spans the class body). */
  ran: Span[];
  /** See {@link ModuleUse.shared}. */
  shared: boolean;
}

const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => object;
const MARK = "/*keiko*/";
/**
 * Where a module's code starts in the script V8 sees. Vite's module runner wraps it in
 * `new AsyncFunction(keys…, '"use strict";\n' + code)`, which V8 compiles as `(async function anonymous(…) {\n…\n})`.
 */
export const WRAPPER =
  1 +
  new AsyncFunction(
    ssrModuleExportsKey,
    ssrImportMetaKey,
    ssrImportKey,
    ssrDynamicImportKey,
    ssrExportAllKey,
    ssrExportNameKey,
    `"use strict";\n${MARK}`,
  )
    .toString()
    .indexOf(MARK);
/** `\n})` after the module's code. */
const WRAPPER_END = 3;

/** What {@link BootEvaluator} adds to each project module: a boot number, always the same length. */
const bootTag = (n: number) => `\n//keiko-boot ${String(n).padStart(10, "0")}`;
const BOOT_TAG = bootTag(0).length;

/**
 * Runs each project module with a different last line every time it loads. V8 reuses compiled code for an
 * identical source, and in binary coverage it reports a function only the first time it runs, so without
 * this a module's second boot (the next test) would look like it never loaded. Dependencies keep the cache.
 */
export class BootEvaluator extends ESModulesEvaluator {
  private boots = 0;
  /** Project modules evaluated since the last {@link drain}: some (no source map, e.g. `?raw`) have no coverage. */
  private evaluated = new Set<string>();

  override runInlinedModule(context: Parameters<ESModulesEvaluator["runInlinedModule"]>[0], code: string, module?: { id?: string }) {
    const id = module?.id ?? "";
    // A virtual module (a plugin's `\0…` id) may be built from files it reads: track it too, in full.
    if (id && !id.includes("/node_modules/")) this.evaluated.add(id);
    if (!ownModule(id)) return super.runInlinedModule(context, code);
    return super.runInlinedModule(context, code + bootTag(++this.boots));
  }

  /** The project modules evaluated since the last call. */
  drain(): Set<string> {
    const out = this.evaluated;
    this.evaluated = new Set();
    return out;
  }
}

/** Reads V8 function coverage around each test, through the inspector of this process. */
export class CoverageRecorder {
  private readonly session = new Session();
  /**
   * Every script V8 has reported, by script id, with the functions that haven't run yet in any test and the
   * ones that have. After its first report V8 only lists what ran since, so this is the script's memory.
   */
  private readonly known = new Map<string, Known>();
  /** Scripts that loaded with the test files: every test may use them. */
  private readonly collected = new Set<string>();

  async start(): Promise<void> {
    this.session.connect();
    await this.session.post("Profiler.enable");
    // Binary function coverage: did each function run, not how often or which branches. Counting calls or
    // blocks keeps V8 from optimizing and doubles a run's time; this costs next to nothing. V8 reports a
    // function only the first time it runs: every test boots fresh copies of the game's modules (see
    // BootEvaluator), so their report is exact, and in the test files a function an earlier test ran
    // counts as run, which only ever runs more tests.
    await this.session.post("Profiler.startPreciseCoverage", { callCount: false, detailed: false });
  }

  async stop(): Promise<void> {
    try {
      await this.session.post("Profiler.stopPreciseCoverage");
      await this.session.post("Profiler.disable");
    } finally {
      this.session.disconnect();
    }
  }

  /** What V8 has to report since the last take, for this project's own modules. */
  private async take(): Promise<ScriptCoverage[]> {
    const { result } = (await this.session.post("Profiler.takePreciseCoverage")) as { result: ScriptCoverage[] };
    return result.filter((s) => ownModule(s.url));
  }

  /** Call once the test files have loaded: what ran then counts as run for every test. */
  async markCollected(): Promise<void> {
    for (const s of await this.take()) {
      const known = this.learn(s);
      if (known) this.collected.add(s.scriptId);
    }
  }

  /**
   * What ran since the last call, by module id. `evaluated` lists the project modules the runner evaluated
   * meanwhile: one with no coverage (no source map, so V8 doesn't know its id) counts as used in full.
   */
  async used(evaluated: Set<string> = new Set()): Promise<Map<string, RawUse>> {
    const out = new Map<string, RawUse>();
    const add = (id: string, use: RawUse) => {
      const before = out.get(id);
      out.set(
        id,
        before
          ? {
              scriptLength: before.scriptLength === use.scriptLength ? use.scriptLength : -1,
              idle: intersectRaw(before.idle, use.idle),
              ran: [...before.ran, ...use.ran],
              shared: before.shared || use.shared,
            }
          : use,
      );
    };
    const touched = new Set<string>(this.collected);
    const fresh = new Set<string>();
    for (const s of await this.take()) {
      const known = this.known.get(s.scriptId);
      if (!known) {
        // A module that didn't load in this test and was never reported before: nothing to attribute.
        if (this.learn(s)) {
          fresh.add(s.scriptId);
          touched.add(s.scriptId);
        }
        continue;
      }
      // Seen before: what ran now ran in this test, even though the module loaded earlier (a helper one
      // test imported and a later one calls).
      for (const f of s.functions)
        for (const r of f.ranges) {
          if (r.count === 0 || (r.startOffset <= 1 && r === f.ranges[0])) continue;
          const key = `${r.startOffset}:${r.endOffset}`;
          known.idle.delete(key);
          known.ran.set(key, [r.startOffset, r.endOffset]);
          touched.add(s.scriptId);
        }
    }
    for (const scriptId of touched) {
      const k = this.known.get(scriptId);
      if (!k) continue;
      add(k.id, { scriptLength: k.length, idle: [...k.idle.values()], ran: [...k.ran.values()], shared: !fresh.has(scriptId) });
    }
    for (const id of evaluated) if (!out.has(id)) add(id, { scriptLength: -1, idle: [], ran: [], shared: false });
    return out;
  }

  /** Remember a script on its first report. Returns false for one whose top level didn't run (an old game). */
  private learn(s: ScriptCoverage): boolean {
    const script = s.functions.find((f) => f.ranges[0]?.startOffset === 0)?.ranges[0];
    if (!script?.count) return false;
    const ran = new Map<string, Span>();
    for (const f of s.functions)
      for (const r of f.ranges)
        if (r.count > 0 && !(r.startOffset <= 1 && r === f.ranges[0]))
          ran.set(`${r.startOffset}:${r.endOffset}`, [r.startOffset, r.endOffset]);
    this.known.set(s.scriptId, { id: moduleId(s.url), length: script.endOffset, idle: functionsIdle(s), ran });
    return true;
  }
}

interface Known {
  id: string;
  length: number;
  idle: Map<string, RawUse["idle"][number]>;
  ran: Map<string, Span>;
}

/** A script's Vite module id: its `sourceURL`, which Vite percent-encodes whitespace in. */
const moduleId = (url: string) => url.replace(/%(09|0A|0D|20)/gi, (m) => decodeURIComponent(m));

/** The ranges in a script's report that didn't run, by `start:end`, leaving out the module's own top level. */
function functionsIdle(s: ScriptCoverage): Map<string, RawUse["idle"][number]> {
  const idle = new Map<string, RawUse["idle"][number]>();
  for (const f of s.functions) {
    f.ranges.forEach((r, i) => {
      // The script and its wrapper function: the module loaded, so its top level ran.
      if (r.count > 0 || (r.startOffset <= 1 && i === 0)) return;
      idle.set(`${r.startOffset}:${r.endOffset}`, [r.startOffset, r.endOffset, i === 0]);
    });
  }
  return idle;
}

/**
 * A module keiko tracks: a Vite id that is an absolute path outside node_modules. That includes linked
 * packages and other code outside the project root, whose edits the lockfile doesn't show.
 */
function ownModule(url: string): boolean {
  return isAbsolute(url) && !url.includes("/node_modules/");
}

function intersectRaw(a: RawUse["idle"], b: RawUse["idle"]): RawUse["idle"] {
  const keys = new Set(b.map(([s, e, fn]) => `${s}:${e}:${fn}`));
  return a.filter(([s, e, fn]) => keys.has(`${s}:${e}:${fn}`));
}

/**
 * Module code with Vite's trailing `//# sourceURL` and source map comments cut off: the map changes with
 * every edit, and would make every edit look like a change to code that ran.
 */
export function normalizeCode(code: string): string {
  // Vite trims the code it serves, so a fresh transform (with a trailing newline) compares the same.
  const cut = code.indexOf("\n//# sourceURL=");
  return (cut >= 0 ? code.slice(0, cut) : code).trimEnd();
}

/**
 * Turn raw coverage into idle spans of the module's (normalized) code. A function that never ran keeps its
 * header up to the first `{` as used, since renaming one that something refers to still breaks the test.
 * Returns undefined when the script doesn't match the code, so the whole module counts as used.
 */
export function idleSpans(raw: RawUse, served: string): Span[] | undefined {
  if (raw.scriptLength !== WRAPPER + served.length + BOOT_TAG + WRAPPER_END) return undefined;
  const code = normalizeCode(served);
  const spans: Span[] = [];
  for (const [s0, e0, fn] of raw.idle) {
    let s = Math.max(0, s0 - WRAPPER);
    const e = Math.min(code.length, e0 - WRAPPER);
    if (fn) {
      const brace = code.indexOf("{", s);
      if (brace < 0 || brace >= e) continue;
      s = brace + 1;
    }
    if (e > s) spans.push([s, e]);
  }
  // A function that ran is never idle, even inside a range V8 reports as not run.
  const ran = raw.ran.map(([s, e]): Span => [Math.max(0, s - WRAPPER), Math.min(code.length, e - WRAPPER)]);
  return subtractSpans(mergeSpans(spans), mergeSpans(ran));
}

/** `a` with every part covered by `b` removed. Both sorted and merged. */
export function subtractSpans(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  for (const [s0, e] of a) {
    let s = s0;
    for (const [bs, be] of b) {
      if (be <= s || bs >= e) continue;
      if (bs > s) out.push([s, bs]);
      s = Math.max(s, be);
      if (s >= e) break;
    }
    if (s < e) out.push([s, e]);
  }
  return out;
}

export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out: Span[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

// ---- diffing -------------------------------------------------------------------------------------

/**
 * The parts of `before` that `after` changed, as spans of `before`: replaced or deleted lines, and
 * `[p, p]` where lines were inserted. Line-based (Myers), so it stays cheap on large modules.
 */
export function changedSpans(before: string, after: string): Span[] {
  return changedHunks(before, after).map((h) => h.span);
}

/** A changed part of `before`: the span it covers there and the lines that replace it. */
export interface Hunk {
  span: Span;
  added: string;
}

/** Like {@link changedSpans}, with the text each change puts in, so a caller can check what an edit adds. */
export function changedHunks(before: string, after: string): Hunk[] {
  if (before === after) return [];
  const a = before.split("\n");
  const b = after.split("\n");
  const starts: number[] = [];
  let at = 0;
  for (const line of a) {
    starts.push(at);
    at += line.length + 1;
  }
  const lineSpan = (i: number): Span => [starts[i] ?? before.length, (starts[i] ?? before.length) + (a[i]?.length ?? 0)];
  // Common lines at either end are cheap to skip and keep the diff small.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const ops = myers(a.slice(head, a.length - tail), b.slice(head, b.length - tail));
  if (!ops) {
    const first = lineSpan(head);
    const last = lineSpan(a.length - tail - 1);
    return [{ span: [first[0], Math.max(first[0], last[1])], added: b.slice(head, b.length - tail).join("\n") }];
  }
  const out: Hunk[] = [];
  // Consecutive deleted lines are one hunk, and lines inserted right after them replace them.
  let last: { hunk: Hunk; endA: number } | undefined;
  for (const op of ops) {
    if (op.kind === "delete") {
      const span = lineSpan(head + op.a);
      if (last && last.endA === op.a && last.hunk.added === "") last.hunk.span[1] = span[1];
      // Inserted lines that came first at this spot replace this line.
      else if (last && last.endA === op.a && last.hunk.span[0] === last.hunk.span[1]) last.hunk.span = span;
      else {
        last = { hunk: { span, added: "" }, endA: op.a };
        out.push(last.hunk);
      }
      last.endA = op.a + 1;
    } else {
      const line = b[head + op.b] ?? "";
      if (last && last.endA === op.a) last.hunk.added = last.hunk.added ? `${last.hunk.added}\n${line}` : line;
      else {
        const p = starts[head + op.a] ?? before.length;
        last = { hunk: { span: [p, p], added: line }, endA: op.a };
        out.push(last.hunk);
      }
    }
  }
  return out;
}

/**
 * True when text keeps its own brackets: it never closes one it didn't open and closes all it opens. An
 * edit inside a function that never ran is only harmless while it stays inside: `return 5; } v = 2; f() {`
 * closes the function and adds code that runs at load. Brackets in strings count too, which only makes
 * more tests due.
 */
export function selfContained(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/** True when the module's code compiles as the runner will run it: a syntax error fails the test at load. */
export function compiles(code: string): boolean {
  try {
    new AsyncFunction(
      ssrModuleExportsKey,
      ssrImportMetaKey,
      ssrImportKey,
      ssrDynamicImportKey,
      ssrExportAllKey,
      ssrExportNameKey,
      `"use strict";\n${code}`,
    );
    return true;
  } catch {
    return false;
  }
}

type Op = { kind: "delete" | "insert"; a: number; b: number };
const MAX_EDITS = 1000;

/** Line edits from `a` to `b` (positions in `a`), or undefined past {@link MAX_EDITS}: treat the module as rewritten. */
function myers(a: string[], b: string[]): Op[] | undefined {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDITS);
  const off = max + 1;
  let v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    const next = v.slice();
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v[off + k - 1] ?? 0) < (v[off + k + 1] ?? 0)) ? (v[off + k + 1] ?? 0) : (v[off + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      next[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, off, n, m);
    }
    v = next;
  }
  return undefined;
}

function backtrack(trace: Int32Array[], d: number, off: number, n: number, m: number): Op[] {
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let step = d; step > 0; step--) {
    const v = trace[step] as Int32Array;
    const k = x - y;
    const down = k === -step || (k !== step && (v[off + k - 1] ?? 0) < (v[off + k + 1] ?? 0));
    const prevK = down ? k + 1 : k - 1;
    const prevX = v[off + prevK] ?? 0;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
    }
    if (down) ops.push({ kind: "insert", a: x, b: y - 1 });
    else ops.push({ kind: "delete", a: x - 1, b: y });
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

/** True when a change reaches code the test ran: a change is harmless only if it sits inside one idle span. */
export function touchesUsed(changes: Span[], idle: Span[], code: string): boolean {
  for (const [s0, e0] of changes) {
    let s = s0;
    let e = e0;
    // Indentation and trailing spaces belong to whatever the line holds.
    while (s < e && /\s/.test(code[s] ?? "")) s++;
    while (e > s && /\s/.test(code[e - 1] ?? "")) e--;
    const inside = s === e ? idle.some(([is, ie]) => is < s && s < ie) : idle.some(([is, ie]) => is <= s && e <= ie);
    if (!inside) return true;
  }
  return false;
}

// ---- queues --------------------------------------------------------------------------------------

/** Hooks into the running Vite server, so the store can compare what a test used with what's there now. */
export interface ServerAccess {
  /** The module's code as the runner would load it, or undefined if it no longer loads. */
  transform(id: string): Promise<string | undefined>;
  /** The body the dev server sends for a URL path, or undefined. */
  fetch(path: string): Promise<Uint8Array | undefined>;
}

const hash = (data: string | Uint8Array) => createHash("sha1").update(data).digest("hex").slice(0, 16);

const ENV_FILES = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  ...["vite", "debuff"].flatMap((n) => ["ts", "mts", "js", "mjs", "cjs"].map((ext) => `${n}.config.${ext}`)),
];

const QUEUE_NAME = /^[\w.-]{1,64}$/;

/** Source files Vite serves as modules: their changes are tracked as code, not as files read. */
const MODULE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|sass|less|html)$/;

/**
 * Report files read through node:fs (`readFileSync`, `readFile`, `fs.promises.readFile`) to `onRead`, so a
 * test that compares with a file it reads (`tests/expected.json`) runs again when the file changes. Returns
 * a function that puts the originals back.
 */
export function watchReads(onRead: (path: unknown) => void): () => void {
  // The CommonJS module object is writable (the ESM namespace isn't); syncBuiltinESMExports() then updates
  // the `import { readFileSync } from "node:fs"` bindings to match.
  const cjs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
  const fsMod = cjs as unknown as Record<string, (...args: unknown[]) => unknown>;
  const promises = cjs.promises as unknown as Record<string, (...args: unknown[]) => unknown>;
  const saved = [
    [fsMod, "readFileSync", fsMod.readFileSync],
    [fsMod, "readFile", fsMod.readFile],
    [promises, "readFile", promises.readFile],
  ] as const;
  for (const [target, name, original] of saved) {
    target[name] = function (this: unknown, ...args: unknown[]) {
      onRead(args[0]);
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
  syncBuiltinESMExports();
  return () => {
    for (const [target, name, original] of saved) target[name] = original as (...args: unknown[]) => unknown;
    syncBuiltinESMExports();
  };
}

/** Where keiko keeps queues: `node_modules/.cache/keiko`, next to Vite's own cache (which makes node_modules if it's missing). */
export function cacheDir(root: string): string {
  return join(root, "node_modules", ".cache", "keiko");
}

/** The record of one queue, plus what the current run adds to it. */
export class ImpactStore {
  env: string;
  private readonly envParts: string[];
  private readonly file: string;
  private readonly previous: QueueFile | undefined;
  private readonly next: Record<string, TestUse>;
  private inputs = new Set<string>();

  constructor(
    private readonly root: string,
    readonly queue: string,
    private readonly dir: string,
    version: string,
  ) {
    if (!QUEUE_NAME.test(queue)) throw new Error(`"${queue}" isn't a queue name: use letters, digits, "-", "_" and "." (up to 64).`);
    this.file = join(dir, `queue-${queue}.json`);
    const env = [`keiko ${version}`, `node ${process.versions.node.split(".")[0]}`];
    for (const f of ENV_FILES) {
      const path = join(root, f);
      if (existsSync(path)) env.push(`${f} ${hash(readFileSync(path))}`);
    }
    this.envParts = env;
    this.env = hash(env.join("\n"));
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as QueueFile;
      if (parsed.version === 1 && parsed.tests) this.previous = parsed;
    } catch {
      // No queue yet, or one this version can't read: every test is due.
    }
    this.next = { ...(this.previous?.tests ?? {}) };
  }

  /**
   * More files whose change can reach every test, known once the dev server runs: `.env` files, files the
   * Vite config imports, the tsconfig files it extends. Call before {@link due}.
   */
  addSetup(paths: string[]): void {
    for (const path of [...new Set(paths)].sort()) {
      if (existsSync(path) && statSync(path).isFile()) this.envParts.push(`${relative(this.root, path)} ${hash(readFileSync(path))}`);
    }
    this.env = hash(this.envParts.join("\n"));
  }

  /** Tests due in this queue, with why. Tests not in the map can be skipped: nothing they used changed. */
  async due(ids: string[], server: ServerAccess): Promise<Map<string, DueReason>> {
    const out = new Map<string, DueReason>();
    const prev = this.previous;
    const current = new Map<string, Promise<{ file?: string; code?: string; text?: string }>>();
    const currentModule = (id: string, file: string | undefined) => {
      let p = current.get(id);
      if (!p) {
        p = (async () => {
          const source = existsSync(id) ? readFileSync(id) : undefined;
          const onDisk = source ? hash(source) : undefined;
          // Same file as last time: no need to transform it, unless what Vite serves for it depends on other
          // files (an import.meta.glob lists whatever matches now).
          if (onDisk && onDisk === file && !source?.includes("import.meta.glob")) return { file: onDisk };
          const served = await server.transform(id).catch(() => undefined);
          if (served === undefined) return { ...(onDisk ? { file: onDisk } : {}) };
          const text = normalizeCode(served);
          return { ...(onDisk ? { file: onDisk } : {}), code: hash(text), text };
        })();
        current.set(id, p);
      }
      return p;
    };
    const inputs = new Map<string, Promise<string | undefined>>();
    const currentInput = (key: string) => {
      let p = inputs.get(key);
      if (!p) {
        p = this.hashInput(key, server);
        inputs.set(key, p);
      }
      return p;
    };
    // Per (old code, new code): where it changed, and whether the change can be judged span by span at all.
    // It can't when the new code doesn't compile (the test fails at load) or an edit reaches past its own
    // brackets (it could close a function that never ran and add code that runs at load).
    const diffs = new Map<string, { spans: Span[]; judgeable: boolean }>();
    const diff = (oldHash: string, old: string, newHash: string, text: string) => {
      const key = `${oldHash}>${newHash}`;
      let d = diffs.get(key);
      if (!d) {
        const hunks = changedHunks(old, text);
        const judgeable = compiles(text) && hunks.every((h) => selfContained(old.slice(...h.span)) && selfContained(h.added));
        d = { spans: hunks.map((h) => h.span), judgeable };
        diffs.set(key, d);
      }
      return d;
    };
    const touched = (oldHash: string, old: string, newHash: string, text: string, idle: Span[]) => {
      const d = diff(oldHash, old, newHash, text);
      return !d.judgeable || touchesUsed(d.spans, idle, old);
    };
    for (const id of ids) {
      const use = prev?.tests[id];
      if (!prev || !use) out.set(id, "new");
      else if ((use.env ?? prev.env) !== this.env) out.set(id, "setup");
      else if (use.status !== "pass") out.set(id, "failed");
      else {
        let reason: DueReason | undefined;
        for (const [key, h] of Object.entries(use.inputs)) {
          if (((await currentInput(key)) ?? "missing") !== h) {
            reason = "input";
            break;
          }
        }
        if (!reason) {
          for (const [mod, before] of Object.entries(use.modules)) {
            const now = await currentModule(mod, before.file);
            if (now.file && now.file === before.file && now.code === undefined) continue;
            if (now.code === before.code) continue;
            // A module that outlives a test can carry an earlier test's effects into this one through its
            // state, so any change to it counts, whether this test ran the changed code or not.
            if (before.shared) {
              reason = "code";
              break;
            }
            const old = this.readCode(before.code);
            if (now.text === undefined || old === undefined || touched(before.code, old, now.code ?? "", now.text, before.idle)) {
              reason = "code";
              break;
            }
          }
        }
        if (reason) out.set(id, reason);
      }
    }
    return out;
  }

  /** Call when a test starts: inputs noted from now on are its own. */
  beginTest(): void {
    this.inputs = new Set();
    this.reading = true;
  }

  /** While a test runs: files read through node:fs count as its inputs (see {@link watchReads}). */
  private reading = false;

  /** A file read through node:fs. Kept only while a test runs, and only for data: modules are tracked as code. */
  noteRead(path: unknown): void {
    if (!this.reading) return;
    let file: string;
    if (typeof path === "string") file = resolve(path);
    else if (path instanceof URL && path.protocol === "file:") file = fileURLToPath(path);
    else return;
    if (file.includes("/node_modules/") || file.includes("/.git/") || MODULE_FILE.test(file)) return;
    this.inputs.add(`file:${file}`);
  }

  /** A file the running test read (a page, a replay). */
  noteFile(path: string): void {
    this.inputs.add(`file:${resolve(path)}`);
  }

  /** A URL the running test's page requested from the dev server. */
  noteRequest(url: string | undefined, publicDir: string | undefined): void {
    if (!url) return;
    let path = url.split(/[?#]/)[0] ?? "";
    try {
      path = decodeURIComponent(path);
    } catch {
      // Keep it as sent.
    }
    if (!path.startsWith("/")) return;
    const candidates = path.startsWith("/@fs/") ? [path.slice(4)] : [join(this.root, path), ...(publicDir ? [join(publicDir, path)] : [])];
    const file = candidates.find((c) => existsSync(c) && statSync(c).isFile());
    this.inputs.add(file ? `file:${file}` : `url:${path}`);
  }

  /** Call when a test ends, with what it ran, to keep (passes) or mark (failures) in the queue. */
  async endTest(id: string, status: "pass" | "fail", used: Map<string, RawUse>, server: ServerAccess): Promise<void> {
    this.reading = false;
    const inputs = [...this.inputs];
    if (status === "fail") {
      this.next[id] = { status, modules: {}, inputs: {}, env: this.env };
      return;
    }
    const modules: Record<string, ModuleUse> = {};
    for (const [mod, raw] of used) {
      const served = await server.transform(mod).catch(() => undefined);
      if (served === undefined) continue;
      const text = normalizeCode(served);
      const code = hash(text);
      this.writeCode(code, text);
      modules[mod] = {
        code,
        ...(existsSync(mod) ? { file: hash(readFileSync(mod)) } : {}),
        idle: idleSpans(raw, served) ?? [],
        ...(raw.shared ? { shared: true as const } : {}),
      };
    }
    const hashed: Record<string, string> = {};
    for (const key of inputs) {
      const h = await this.hashInput(key, server);
      // A file that's gone still counts: if it comes back, the test is due.
      hashed[key] = h ?? "missing";
    }
    this.next[id] = { status, modules, inputs: hashed, env: this.env };
  }

  /** Drop tests that no longer exist (only after a run that loaded every test file). */
  prune(existing: Set<string>): void {
    for (const id of Object.keys(this.next)) if (!existing.has(id)) delete this.next[id];
  }

  /** Write the queue, and drop cached code no queue refers to. */
  save(): void {
    mkdirSync(join(this.dir, "code"), { recursive: true });
    const data: QueueFile = { version: 1, env: this.env, tests: this.next };
    writeFileSync(this.file, JSON.stringify(data));
    const keep = new Set<string>();
    for (const name of readdirSync(this.dir)) {
      if (!/^queue-.*\.json$/.test(name)) continue;
      try {
        const q = JSON.parse(readFileSync(join(this.dir, name), "utf8")) as QueueFile;
        for (const t of Object.values(q.tests ?? {})) for (const m of Object.values(t.modules)) keep.add(m.code);
      } catch {
        // Unreadable queue: it keeps nothing.
      }
    }
    for (const name of readdirSync(join(this.dir, "code"))) {
      if (!keep.has(name.replace(/\.js$/, ""))) rmSync(join(this.dir, "code", name), { force: true });
    }
  }

  private async hashInput(key: string, server: ServerAccess): Promise<string | undefined> {
    if (key.startsWith("file:")) {
      const path = key.slice(5);
      return existsSync(path) ? hash(readFileSync(path)) : undefined;
    }
    const body = await server.fetch(key.slice(4)).catch(() => undefined);
    return body ? hash(body) : undefined;
  }

  private readCode(h: string): string | undefined {
    try {
      return readFileSync(join(this.dir, "code", `${h}.js`), "utf8");
    } catch {
      return undefined;
    }
  }

  private writeCode(h: string, text: string): void {
    const path = join(this.dir, "code", `${h}.js`);
    if (existsSync(path)) return;
    mkdirSync(join(this.dir, "code"), { recursive: true });
    writeFileSync(path, text);
  }
}

/** A stable id for each test: `file › describe › name`, numbered when a file repeats a name. */
export function testIds(tests: { file: string; suites: string[]; name: string }[]): string[] {
  const seen = new Map<string, number>();
  return tests.map((t) => {
    const base = [t.file, ...t.suites, t.name].join(" › ");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} #${n}`;
  });
}
