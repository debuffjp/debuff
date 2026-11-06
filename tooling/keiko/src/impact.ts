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
 * Vite served it then and now, so type-only edits change nothing. Code outside the project root (linked
 * packages) and in node_modules isn't tracked: the lockfile stands in for it.
 *
 * @module
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
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
}

/** What one test used last time it ran in a queue. */
export interface TestUse {
  status: "pass" | "fail";
  /** By module id (an absolute path). */
  modules: Record<string, ModuleUse>;
  /** Files it read (pages, assets, replays) by `file:<path>` or `url:<path>`, with their hash. */
  inputs: Record<string, string>;
}

interface QueueFile {
  version: 1;
  /** Hash of what can change every test at once: lockfiles, configs, keiko and Node versions. */
  env: string;
  tests: Record<string, TestUse>;
}

/** Why a test runs in a `--changed` run, for `--json` and for people asking "why did this run?". */
export type DueReason = "new" | "failed" | "setup" | "code" | "input";

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
  scriptLength: number;
  /** `[start, end, isFunction]` in script offsets. */
  idle: [number, number, boolean][];
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

  constructor(private readonly root: string) {
    super();
  }

  override runInlinedModule(context: Parameters<ESModulesEvaluator["runInlinedModule"]>[0], code: string, module?: { id?: string }) {
    const id = module?.id ?? "";
    return super.runInlinedModule(context, ownModule(this.root, id) ? code + bootTag(++this.boots) : code);
  }
}

/** Reads V8 function coverage around each test, through the inspector of this process. */
export class CoverageRecorder {
  private readonly session = new Session();
  /**
   * Scripts that loaded with the test files (the files' top level, `describe` bodies, helpers they
   * import), with their length and the ranges that ran then: those count as run for every test.
   */
  private readonly collected = new Map<string, { id: string; length: number; idle: Map<string, RawUse["idle"][number]> }>();

  constructor(private readonly root: string) {}

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
    return result.filter((s) => ownModule(this.root, s.url));
  }

  /** Call once the test files have loaded: what ran then counts as run for every test. */
  async markCollected(): Promise<void> {
    for (const s of await this.take()) {
      const script = s.functions.find((f) => f.ranges[0]?.startOffset === 0)?.ranges[0];
      if (!script) continue;
      this.collected.set(s.scriptId, { id: moduleId(s.url), length: script.endOffset, idle: functionsIdle(s) });
    }
  }

  /**
   * What ran since the last call, by module id. After V8's first report on a script, later reports only
   * list what ran since, and a script with nothing new is left out: so the scripts that loaded with the test
   * files are tracked here, each keeping the functions that haven't run yet in any test.
   */
  async used(): Promise<Map<string, RawUse>> {
    const out = new Map<string, RawUse>();
    const add = (id: string, use: RawUse) => {
      const before = out.get(id);
      out.set(id, before ? { scriptLength: use.scriptLength, idle: intersectRaw(before.idle, use.idle) } : use);
    };
    for (const s of await this.take()) {
      const collected = this.collected.get(s.scriptId);
      if (collected) {
        for (const f of s.functions) for (const r of f.ranges) if (r.count > 0) collected.idle.delete(`${r.startOffset}:${r.endOffset}`);
        continue;
      }
      const script = s.functions.find((f) => f.ranges[0]?.startOffset === 0)?.ranges[0];
      // A module that didn't load in this test is an earlier test's game.
      if (!script?.count) continue;
      add(moduleId(s.url), { scriptLength: script.endOffset, idle: [...functionsIdle(s).values()] });
    }
    for (const c of this.collected.values()) add(c.id, { scriptLength: c.length, idle: [...c.idle.values()] });
    return out;
  }
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

/** A project module V8 knows by its Vite id (an absolute path), outside node_modules. */
function ownModule(root: string, url: string): boolean {
  if (!isAbsolute(url) || url.includes("/node_modules/")) return false;
  const rel = relative(root, url);
  return !rel.startsWith("..") && !isAbsolute(rel);
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
  return mergeSpans(spans);
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
    return [[first[0], Math.max(first[0], last[1])]];
  }
  const out: Span[] = [];
  const deleted = new Set(ops.filter((op) => op.kind === "delete").map((op) => op.a));
  for (const op of ops) {
    if (op.kind === "delete") out.push(lineSpan(head + op.a));
    // Lines replacing a deleted line belong to it: the deletion already says where the change is.
    else if (deleted.has(op.a - 1)) continue;
    else {
      const p = starts[head + op.a] ?? before.length;
      out.push([p, p]);
    }
  }
  return out;
}

type Op = { kind: "delete" | "insert"; a: number };
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
    if (down) ops.push({ kind: "insert", a: x });
    else ops.push({ kind: "delete", a: x - 1 });
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

/** Where keiko keeps queues: `node_modules/.cache/keiko`, next to Vite's own cache (which makes node_modules if it's missing). */
export function cacheDir(root: string): string {
  return join(root, "node_modules", ".cache", "keiko");
}

/** The record of one queue, plus what the current run adds to it. */
export class ImpactStore {
  readonly env: string;
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
    this.env = hash(env.join("\n"));
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as QueueFile;
      if (parsed.version === 1 && parsed.tests) this.previous = parsed;
    } catch {
      // No queue yet, or one this version can't read: every test is due.
    }
    this.next = { ...(this.previous?.tests ?? {}) };
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
          const onDisk = existsSync(id) ? hash(readFileSync(id)) : undefined;
          // Same file as last time: no need to transform it.
          if (onDisk && onDisk === file) return { file: onDisk };
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
    for (const id of ids) {
      const use = prev?.tests[id];
      if (!prev || !use) out.set(id, "new");
      else if (prev.env !== this.env) out.set(id, "setup");
      else if (use.status !== "pass") out.set(id, "failed");
      else {
        let reason: DueReason | undefined;
        for (const [key, h] of Object.entries(use.inputs)) {
          if ((await currentInput(key)) !== h) {
            reason = "input";
            break;
          }
        }
        if (!reason) {
          for (const [mod, before] of Object.entries(use.modules)) {
            const now = await currentModule(mod, before.file);
            if (now.file && now.file === before.file) continue;
            if (now.code === before.code) continue;
            const old = this.readCode(before.code);
            if (now.text === undefined || old === undefined || touchesUsed(changedSpans(old, now.text), before.idle, old)) {
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
    const inputs = [...this.inputs];
    if (status === "fail") {
      this.next[id] = { status, modules: {}, inputs: {} };
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
      };
    }
    const hashed: Record<string, string> = {};
    for (const key of inputs) {
      const h = await this.hashInput(key, server);
      // A file that's gone still counts: if it comes back, the test is due.
      hashed[key] = h ?? "missing";
    }
    this.next[id] = { status, modules, inputs: hashed };
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
