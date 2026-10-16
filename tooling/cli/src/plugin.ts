import type { PluginOption } from "vite";

/** Manifest entry types the runtime loader understands. */
export type AssetType = "image" | "json" | "audio" | "text" | "sheet";

/** One frame of a sprite sheet, in source-image pixels. `duration` is in seconds. */
export interface SheetFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  duration?: number;
}

export interface SheetAnimation {
  /** Indices into `frames`. */
  frames: number[];
  loop?: boolean;
}

/** A manifest entry as produced by an importer; the compiler adds `bytes` and `hash`. */
export interface AssetEntry {
  type: AssetType;
  /** URL relative to the site root, e.g. "assets/hero.png". */
  src: string;
  group?: string;
  /** Uniform sprite grid (from the `name@WxH.png` convention). */
  grid?: { frameWidth: number; frameHeight: number };
  /** Region of `src` holding this image, when it was packed into an atlas. */
  rect?: { x: number; y: number; w: number; h: number };
  /** Explicit frames, for `sheet` entries. */
  frames?: SheetFrame[];
  animations?: Record<string, SheetAnimation>;
}

export interface CompiledEntry extends AssetEntry {
  bytes: number;
  hash: string;
}

/** What an importer is given. Serialised as JSON on stdin for command importers. */
export interface SourceFile {
  /** Absolute path on disk. */
  path: string;
  /** Path relative to `assets/`, forward slashes. */
  rel: string;
  /** Default asset id derived from the path (group prefix, no extension). */
  id: string;
  /** Preload group (first folder), if any. */
  group?: string;
  /** Lower-case extension including the dot, e.g. ".json". For multi-part matches, the matched suffix. */
  ext: string;
}

/** A generated file, served in dev and emitted into the build under `assets/`. */
export interface GeneratedFile {
  /** Path relative to `assets/`, e.g. "hero.png". */
  path: string;
  contents: string;
  encoding?: "utf8" | "base64";
}

/** What an importer returns. Command importers print this as JSON on stdout. */
export interface ImportResult {
  /** Manifest entries keyed by asset id. Entries without `src` bytes on disk must reference a generated file. */
  assets: Record<string, AssetEntry>;
  /** Files to serve and emit (atlases, transcoded audio…). Sources are never modified. */
  outputs?: GeneratedFile[];
  /** Other source files (relative to `assets/`) this importer handled, so built-ins skip them. */
  consumes?: string[];
  warnings?: string[];
}

interface ImporterBase {
  /** Used in errors, cache keys and `debuff inspect`. */
  name: string;
  /** File suffixes this importer claims, matched case-insensitively against the end of the path, e.g. [".aseprite.json"]. */
  extensions: string[];
}

/** Runs inside the CLI process. Must be a pure function of the file contents and options. */
export interface FunctionImporter extends ImporterBase {
  import(file: SourceFile): ImportResult | Promise<ImportResult>;
}

/** Runs an external program (any language): `SourceFile` JSON on stdin, `ImportResult` JSON on stdout. */
export interface CommandImporter extends ImporterBase {
  command: [string, ...string[]];
}

export type AssetImporter = FunctionImporter | CommandImporter;

export interface CommandOption {
  /** cac-style flags, e.g. "--out <dir>" or "-w, --watch". */
  flags: string;
  description: string;
  default?: unknown;
}

export interface CommandContext {
  /** Project root. */
  root: string;
  /** Positional arguments after the command name. */
  args: string[];
  /** Parsed options (camelCased). */
  options: Record<string, unknown>;
  /** Emit machine-readable output when true (`--json`). */
  json: boolean;
}

/** A CLI command, exposed as `debuff <plugin>:<name>`. */
export interface CommandDef {
  /** kebab-case; the full command is `<plugin name>:<name>`. */
  name: string;
  description: string;
  options?: CommandOption[];
  /** Return an exit code (0 = success). */
  run(ctx: CommandContext): number | Promise<number>;
}

/** What a scenario step handler can do in the running game. */
export interface StepContext {
  /** Call a `window.__DEBUFF_DEV__` method, e.g. `call("press", "Space")`. */
  call<R = unknown>(method: string, ...args: unknown[]): Promise<R>;
  /** Evaluate a function in the page (Playwright semantics). */
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
}

/** A scenario step type, used in JSON as `{ "<plugin>:<name>": value }`. */
export interface StepDef<V = unknown> {
  /** kebab-case; the step key is `<plugin name>:<name>`. */
  name: string;
  description: string;
  /** JSON Schema for the step's value; merged into the scenario schema for editors and agents. */
  schema: Record<string, unknown>;
  /** Return a failure message, or undefined if the step passed. */
  run(value: V, ctx: StepContext): string | undefined | Promise<string | undefined>;
}

/** Tooling plugin contract (ADR 0004). */
export interface ToolingPlugin {
  /** Unique kebab-case id. */
  name: string;
  /** Contract version this plugin targets. */
  apiVersion: 1;
  assets?: AssetImporter[];
  /** CLI commands, namespaced as `debuff <name>:<command>`. */
  commands?: CommandDef[];
  /** Scenario step types, namespaced as `"<name>:<step>"`. */
  scenarioSteps?: StepDef[];
  /** Extra Vite plugins (escape hatch). */
  vite?: PluginOption;
}

export const TOOLING_API_VERSION = 1;
