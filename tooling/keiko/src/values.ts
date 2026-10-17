/** Read a dotted path such as `"player.x"` or `"enemies.0.hp"`. Missing parts read as `undefined`. */
export function pick(value: unknown, path: string): unknown {
  if (path === "") return value;
  return path
    .split(".")
    .reduce<unknown>((o, k) => (o !== null && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), value);
}

/** Structural equality for JSON-like values (plus `NaN`, `Map`, `Set` and `Date`). */
export function deepEqual(a: unknown, b: unknown): boolean {
  return firstDifference(a, b) === undefined;
}

/**
 * The first path at which two values differ (`""` for the values themselves), or `undefined` when they're equal.
 * Used to say *where* two game states diverge, not just that they do.
 */
export function firstDifference(a: unknown, b: unknown, path = ""): string | undefined {
  if (Object.is(a, b)) return undefined;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return path;
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  if (a instanceof Date || b instanceof Date)
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime() ? undefined : path;
  if (a instanceof Map || b instanceof Map || a instanceof Set || b instanceof Set) {
    return firstDifference(a instanceof Map || a instanceof Set ? [...a] : a, b instanceof Map || b instanceof Set ? [...b] : b, path);
  }
  const join = (k: string) => (path ? `${path}.${k}` : k);
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const k of keys) {
    if (!(k in ra) || !(k in rb)) return join(k);
    const d = firstDifference(ra[k], rb[k], join(k));
    if (d !== undefined) return d;
  }
  return undefined;
}

/** A short, readable rendering of a value for failure messages. Long values are cut with an ellipsis. */
export function show(value: unknown, max = 160): string {
  let text: string;
  if (typeof value === "string") text = JSON.stringify(value);
  else if (typeof value === "function") text = `[Function ${value.name || "anonymous"}]`;
  else if (typeof value === "bigint") text = `${value}n`;
  else if (value === undefined || typeof value === "symbol" || Number.isNaN(value)) text = String(value);
  else if (value instanceof Map) text = `Map(${show([...value], max)})`;
  else if (value instanceof Set) text = `Set(${show([...value], max)})`;
  else if (value instanceof Error) text = `${value.name}: ${value.message}`;
  else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
