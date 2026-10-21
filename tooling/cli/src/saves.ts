import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Save compatibility (ADR 0014). The Vite plugin finds `new Storage("key", { ...defaults })` calls during a
 * build and records each save's fields and their JSON kinds. `debuff build` compares them with `saves.json`,
 * committed in the project like a lockfile, so a change that would break players' saves is caught before release.
 */

/** A save found in the game's code. `fields` maps a path ("best", "opts.volume") to its JSON kind. */
export interface SaveInfo {
  key: string;
  /** Source file, relative to the project root. */
  file: string;
  /** `version` from the Storage options, if it's a number literal; "unknown" if set some other way. */
  version?: number | "unknown";
  fields: Record<string, string>;
}

/** A `new Storage(...)` call the build couldn't read (a variable key, computed defaults). */
export interface UncheckedSave {
  file: string;
  reason: string;
}

export interface SavesFound {
  saves: SaveInfo[];
  unchecked: UncheckedSave[];
}

export interface SaveIssue {
  level: "error" | "warning" | "note";
  key: string;
  message: string;
}

export interface SaveCheck {
  /** The saves in this build. */
  saves: SaveInfo[];
  unchecked: UncheckedSave[];
  issues: SaveIssue[];
  /** True when saves.json was written (first build, or --accept-saves). */
  accepted: boolean;
}

export const SAVES_FILE = "saves.json";
/** Where the plugin leaves what it found, for `debuff build` to read. */
export const SAVES_FOUND = join(".debuff", "saves-found.json");

// --- finding saves in a module (ESTree from Vite's `this.parse`, after TypeScript is stripped) --------------

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are walked structurally.
type Node = any;

function kindOf(node: Node): string {
  switch (node?.type) {
    case "Literal":
      return node.value === null ? "null" : typeof node.value === "object" ? "unknown" : typeof node.value;
    case "TemplateLiteral":
      return "string";
    case "ArrayExpression":
      return "array";
    case "ObjectExpression":
      return "object";
    case "UnaryExpression":
      return node.operator === "-" || node.operator === "+" ? kindOf(node.argument) : node.operator === "!" ? "boolean" : "unknown";
    default:
      return "unknown";
  }
}

const propName = (p: Node): string | undefined =>
  p.type === "Property" && !p.computed
    ? p.key.type === "Identifier"
      ? p.key.name
      : typeof p.key.value === "string"
        ? p.key.value
        : undefined
    : undefined;

function fieldsOf(obj: Node, prefix = "", depth = 0, out: Record<string, string> = {}): Record<string, string> {
  for (const p of obj.properties) {
    const name = propName(p);
    if (name === undefined) {
      out[`${prefix}…`] = "unknown";
      continue;
    }
    out[prefix + name] = kindOf(p.value);
    if (depth === 0 && p.value.type === "ObjectExpression") fieldsOf(p.value, `${prefix}${name}.`, 1, out);
  }
  return out;
}

function walk(node: Node, visit: (n: Node) => void): void {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const k in node) {
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walk(c, visit);
    else if (v && typeof v === "object" && typeof v.type === "string") walk(v, visit);
  }
}

/** Saves created in one module. Only `Storage` imported from @debuffjp/core counts. */
export function findSaves(ast: Node, file: string): SavesFound {
  const names = new Set<string>();
  for (const s of ast.body ?? []) {
    if (s.type !== "ImportDeclaration" || s.source.value !== "@debuffjp/core") continue;
    for (const spec of s.specifiers)
      if (spec.type === "ImportSpecifier" && (spec.imported.name ?? spec.imported.value) === "Storage") names.add(spec.local.name);
  }
  const found: SavesFound = { saves: [], unchecked: [] };
  if (!names.size) return found;
  walk(ast, (n) => {
    if (n.type !== "NewExpression" || n.callee.type !== "Identifier" || !names.has(n.callee.name)) return;
    const [key, defaults, options] = n.arguments;
    const keyText = key?.type === "Literal" && typeof key.value === "string" ? key.value : undefined;
    if (keyText === undefined) return found.unchecked.push({ file, reason: "the key isn't a string literal" });
    if (defaults?.type !== "ObjectExpression")
      return found.unchecked.push({ file, reason: `the defaults for "${keyText}" aren't an object literal` });
    const save: SaveInfo = { key: keyText, file, fields: fieldsOf(defaults) };
    if (options?.type === "ObjectExpression") {
      const v = options.properties.find((p: Node) => propName(p) === "version");
      if (v) save.version = v.value.type === "Literal" && typeof v.value.value === "number" ? v.value.value : "unknown";
    } else if (options) save.version = "unknown";
    found.saves.push(save);
  });
  return found;
}

// --- comparing with saves.json -----------------------------------------------------------------------------

export function compareSaves(previous: SaveInfo[], current: SavesFound): SaveIssue[] {
  const issues: SaveIssue[] = [];
  const now = new Map(current.saves.map((s) => [s.key, s]));
  for (const old of previous) {
    const next = now.get(old.key);
    if (!next) {
      issues.push(
        current.unchecked.length
          ? {
              level: "warning",
              key: old.key,
              message: `save "${old.key}" wasn't found, but some saves couldn't be read. Check it still exists, or players lose their progress`,
            }
          : {
              level: "error",
              key: old.key,
              message: `save "${old.key}" is gone: players who have one lose their progress. Keep the key, or accept with --accept-saves`,
            },
      );
      continue;
    }
    const versioned = next.version !== old.version || next.version === "unknown";
    // Fields under one that changed kind ("pops" became an object, so "pops.total" is new) aren't news on their own.
    const changed = Object.keys(old.fields).filter((f) => next.fields[f] !== undefined && next.fields[f] !== old.fields[f]);
    const under = (path: string) => changed.some((c) => path.startsWith(`${c}.`));
    for (const [path, kind] of Object.entries(old.fields)) {
      if (under(path)) continue;
      const k = next.fields[path];
      if (k === undefined) {
        issues.push({ level: "note", key: old.key, message: `field "${path}" removed (old saves keep it, unread)` });
        continue;
      }
      if (k === kind || k === "unknown" || kind === "unknown") continue;
      if (versioned) {
        issues.push({
          level: "note",
          key: old.key,
          message: `field "${path}" is now ${k} (was ${kind}); version changed, so migrate handles old saves`,
        });
      } else {
        issues.push({
          level: "warning",
          key: old.key,
          message: `field "${path}" changed from ${kind} to ${k}. Players' saves fall back to the default for it and lose that progress. Add { version, migrate } to new Storage("${old.key}", …) to carry it over`,
        });
      }
    }
    for (const path of Object.keys(next.fields)) {
      if (!(path in old.fields) && !under(path))
        issues.push({ level: "note", key: old.key, message: `field "${path}" added (old saves get the default)` });
    }
  }
  for (const s of current.saves) {
    if (!previous.some((p) => p.key === s.key)) issues.push({ level: "note", key: s.key, message: `new save "${s.key}"` });
  }
  return issues;
}

/** Read what the build found, compare it with saves.json, and write saves.json on the first build or when accepted. */
export function checkSaves(root: string, options: { accept?: boolean } = {}): SaveCheck | undefined {
  const foundFile = join(root, SAVES_FOUND);
  if (!existsSync(foundFile)) return undefined;
  const found = JSON.parse(readFileSync(foundFile, "utf8")) as SavesFound;
  const lockFile = join(root, SAVES_FILE);
  const lock = existsSync(lockFile) ? (JSON.parse(readFileSync(lockFile, "utf8")) as { saves?: SaveInfo[] }) : undefined;
  const issues = lock ? compareSaves(lock.saves ?? [], found) : [];
  // A game with no saves gets no saves.json until it has one.
  const accept = (!lock && found.saves.length > 0) || options.accept === true;
  if (accept) writeFileSync(lockFile, `${JSON.stringify({ version: 1, saves: found.saves }, null, 2)}\n`);
  return {
    ...found,
    issues: accept
      ? issues.map((i) => (i.level === "note" ? i : { ...i, level: "note" as const, message: `accepted: ${i.message}` }))
      : issues,
    accepted: accept,
  };
}

/** Write what the plugin found during a build. */
export function writeSavesFound(root: string, found: SavesFound): void {
  const file = join(root, SAVES_FOUND);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(found, null, 2)}\n`);
}
