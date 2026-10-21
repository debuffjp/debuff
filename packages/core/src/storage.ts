export interface StorageOptions<T> {
  /**
   * Version of this save's shape, stored next to it. Bump it when you change the shape, and give `migrate`.
   * Saves from before you set a version count as version 0.
   */
  version?: number;
  /** Turns a save written by an older `version` into the current shape. Runs once, when that save loads. */
  migrate?: (old: Record<string, unknown>, from: number) => Partial<T>;
}

/** JSON kind of a value: arrays and null apart from objects. */
const kind = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

type Fields = Record<string, unknown>;

/**
 * Saved fields whose kind matches the default's, over the defaults. A field that changed kind between game
 * versions (a number that became an object) falls back to its default instead of breaking the game; `dropped`
 * is called when that happens. Plain objects are checked one level down. Saved fields the defaults don't have
 * are kept.
 */
function fit(defaults: Fields, saved: Fields, dropped: () => void, deep = true): Fields {
  const out: Fields = { ...saved, ...defaults };
  for (const k in defaults) {
    if (!(k in saved)) continue;
    const d = defaults[k];
    const v = saved[k];
    if (kind(v) !== kind(d)) dropped();
    else out[k] = deep && kind(d) === "object" ? fit(d as Fields, v as Fields, dropped, false) : v;
  }
  return out;
}

/** localStorage get (one argument) or set (two), never throwing: private mode and full storage just do nothing. */
function local(key: string, value?: string): string | null {
  try {
    if (value === undefined) return globalThis.localStorage?.getItem(key) ?? null;
    globalThis.localStorage?.setItem(key, value);
  } catch {}
  return null;
}

/**
 * localStorage wrapper that never throws: private mode, blocked storage and corrupt JSON fall back to defaults
 * so the game still runs. Saves from older versions of the game load safely (see `fit` and `StorageOptions`).
 */
export class Storage<T extends object> {
  private value: T;

  constructor(
    readonly key: string,
    private readonly defaults: T,
    { version = 0, migrate }: StorageOptions<T> = {},
  ) {
    const raw = local(key);
    let saved: Fields = {};
    try {
      const parsed: unknown = JSON.parse(raw ?? "{}");
      if (kind(parsed) === "object") saved = parsed as Fields;
    } catch {}
    const from = Number(local(`${key}:v`)) || 0;
    let changed = false;
    if (raw && migrate && from < version) {
      try {
        saved = migrate(saved, from) as Fields;
        changed = true;
      } catch {}
    }
    this.value = fit(defaults as Fields, saved, () => (changed = true)) as T;
    if (raw && changed) {
      // Keep the save as it was before the first field was dropped or it was migrated, so nothing is lost.
      if (local(`${key}:backup`) === null) local(`${key}:backup`, raw);
      this.write();
    }
    if (version && from !== version) local(`${key}:v`, String(version));
  }

  get data(): Readonly<T> {
    return this.value;
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.value[key];
  }

  set<K extends keyof T>(key: K, v: T[K]): void {
    this.value = { ...this.value, [key]: v };
    this.write();
  }

  reset(): void {
    this.value = { ...this.defaults };
    this.write();
  }

  private write(): void {
    local(this.key, JSON.stringify(this.value));
  }
}
