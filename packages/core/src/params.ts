/** Creative parameters: typed, bounded, inspectable values that humans and agents
 *  can read and tune without editing game logic. */
export interface NumberParamSpec {
  type: "number";
  default: number;
  min?: number;
  max?: number;
  /** Human-readable units, e.g. "px/s". */
  units?: string;
  description?: string;
  /** Whether changing this while running is safe. Default true. */
  live?: boolean;
}

export interface BooleanParamSpec {
  type: "boolean";
  default: boolean;
  description?: string;
  live?: boolean;
}

export type ParamSpec = NumberParamSpec | BooleanParamSpec;
export type ParamSchema = Record<string, ParamSpec>;
export type ParamValues<S extends ParamSchema> = {
  -readonly [K in keyof S]: S[K] extends NumberParamSpec ? number : boolean;
};
export type ParamValue = number | boolean;

export interface ParamChange {
  group: string;
  key: string;
  previous: ParamValue;
  value: ParamValue;
}

export class ParamGroup<S extends ParamSchema> {
  private readonly current: Record<string, ParamValue> = {};

  constructor(
    readonly id: string,
    readonly schema: S,
    private readonly onChange?: (change: ParamChange) => void,
  ) {
    for (const [key, spec] of Object.entries(schema)) this.current[key] = spec.default;
  }

  /** Live view of current values; read every frame, write via `set`. */
  get values(): Readonly<ParamValues<S>> {
    return this.current as ParamValues<S>;
  }

  get<K extends keyof S & string>(key: K): ParamValues<S>[K] {
    return this.current[key] as ParamValues<S>[K];
  }

  /** Set a value, validating type and range. Throws on invalid input rather than clamping silently. */
  set(key: keyof S & string, value: ParamValue): void {
    const spec = this.schema[key];
    if (!spec) throw new Error(`Unknown param "${this.id}.${key}"`);
    if (typeof value !== spec.type) {
      throw new TypeError(`Param "${this.id}.${key}" expects ${spec.type}, got ${typeof value}`);
    }
    if (spec.type === "number") {
      const n = value as number;
      if (!Number.isFinite(n)) throw new RangeError(`Param "${this.id}.${key}" must be finite`);
      if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) {
        throw new RangeError(`Param "${this.id}.${key}"=${n} outside [${spec.min ?? "-inf"}, ${spec.max ?? "inf"}]`);
      }
    }
    const previous = this.current[key] as ParamValue;
    if (previous === value) return;
    this.current[key] = value;
    this.onChange?.({ group: this.id, key, previous, value });
  }

  reset(): void {
    for (const [key, spec] of Object.entries(this.schema)) this.set(key, spec.default);
  }
}

export interface ParamDescription {
  schema: ParamSchema;
  values: Record<string, ParamValue>;
}

/** Registry of every param group in a game; the surface agents and dev tools inspect. */
export class ParamRegistry {
  private readonly groups = new Map<string, ParamGroup<ParamSchema>>();
  private readonly listeners = new Set<(change: ParamChange) => void>();

  define<S extends ParamSchema>(id: string, schema: S): ParamGroup<S> {
    if (this.groups.has(id)) throw new Error(`Param group "${id}" already defined`);
    const group = new ParamGroup(id, schema, (c) => this.listeners.forEach((l) => l(c)));
    this.groups.set(id, group);
    return group;
  }

  group(id: string): ParamGroup<ParamSchema> | undefined {
    return this.groups.get(id);
  }

  onChange(listener: (change: ParamChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** JSON-serialisable snapshot of schemas and current values. */
  describe(): Record<string, ParamDescription> {
    const out: Record<string, ParamDescription> = {};
    for (const [id, g] of this.groups) out[id] = { schema: g.schema, values: { ...g.values } };
    return out;
  }
}
