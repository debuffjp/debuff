/** localStorage wrapper that never throws: private mode, blocked storage and
 *  corrupt JSON fall back to defaults so the game still runs. */
export class Storage<T extends object> {
  private value: T;

  constructor(
    readonly key: string,
    private readonly defaults: T,
  ) {
    this.value = { ...defaults, ...this.read() };
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

  private read(): Partial<T> {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : {};
    } catch {
      return {};
    }
  }

  private write(): void {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify(this.value));
    } catch {
      // Storage unavailable or full; keep in-memory value.
    }
  }
}
