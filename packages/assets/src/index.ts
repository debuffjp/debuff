/** Runtime asset manifest and loader. The build-time compiler (see `@debuff/cli`)
 *  produces the manifest; at runtime this only fetches and caches. */
export type AssetType = "image" | "json" | "audio" | "text";

export interface AssetEntry {
  type: AssetType;
  /** URL relative to the manifest's base. */
  src: string;
  /** Preload group; defaults to "default". */
  group?: string;
  /** Optional sprite-sheet grid for images. */
  grid?: { frameWidth: number; frameHeight: number };
  bytes?: number;
}

export interface AssetManifest {
  version: 1;
  assets: Record<string, AssetEntry>;
}

export interface LoadProgress {
  loaded: number;
  total: number;
}

export class AssetError extends Error {
  constructor(
    readonly id: string,
    message: string,
  ) {
    super(message);
    this.name = "AssetError";
  }
}

type Loaded = HTMLImageElement | ArrayBuffer | string | unknown;

export class Assets {
  private readonly cache = new Map<string, Loaded>();
  private readonly pending = new Map<string, Promise<Loaded>>();

  constructor(
    readonly manifest: AssetManifest,
    private readonly base = "",
  ) {}

  /** Load every asset in the given groups (default: "default"). */
  async load(groups: string | readonly string[] = "default", onProgress?: (p: LoadProgress) => void): Promise<void> {
    const wanted = new Set(typeof groups === "string" ? [groups] : groups);
    const ids = Object.entries(this.manifest.assets)
      .filter(([, e]) => wanted.has(e.group ?? "default"))
      .map(([id]) => id);
    let loaded = 0;
    onProgress?.({ loaded, total: ids.length });
    await Promise.all(
      ids.map(async (id) => {
        await this.fetch(id);
        onProgress?.({ loaded: ++loaded, total: ids.length });
      }),
    );
  }

  has(id: string): boolean {
    return this.cache.has(id);
  }

  image(id: string): HTMLImageElement {
    return this.get(id, "image") as HTMLImageElement;
  }

  json<T = unknown>(id: string): T {
    return this.get(id, "json") as T;
  }

  /** Raw encoded audio; decode with `@debuff/audio`. */
  audio(id: string): ArrayBuffer {
    return this.get(id, "audio") as ArrayBuffer;
  }

  text(id: string): string {
    return this.get(id, "text") as string;
  }

  entry(id: string): AssetEntry {
    const e = this.manifest.assets[id];
    if (!e) throw new AssetError(id, `Unknown asset "${id}". ${suggest(id, Object.keys(this.manifest.assets))}`);
    return e;
  }

  /** Fetch a single asset (lazy loading). Concurrent calls share one request. */
  fetch(id: string): Promise<Loaded> {
    if (this.cache.has(id)) return Promise.resolve(this.cache.get(id));
    const existing = this.pending.get(id);
    if (existing) return existing;
    const entry = this.entry(id);
    const url = this.base + entry.src;
    const p = loadOne(entry.type, url)
      .then((value) => {
        this.cache.set(id, value);
        this.pending.delete(id);
        return value;
      })
      .catch((err: unknown) => {
        this.pending.delete(id);
        throw new AssetError(id, `Failed to load asset "${id}" from ${url}: ${err instanceof Error ? err.message : String(err)}`);
      });
    this.pending.set(id, p);
    return p;
  }

  private get(id: string, type: AssetType): Loaded {
    const entry = this.entry(id);
    if (entry.type !== type) throw new AssetError(id, `Asset "${id}" is ${entry.type}, not ${type}`);
    if (!this.cache.has(id)) {
      throw new AssetError(id, `Asset "${id}" not loaded yet. Load its group "${entry.group ?? "default"}" first.`);
    }
    return this.cache.get(id);
  }
}

async function loadOne(type: AssetType, url: string): Promise<Loaded> {
  if (type === "image") {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (type === "json") return res.json();
  if (type === "text") return res.text();
  return res.arrayBuffer();
}

function suggest(id: string, known: string[]): string {
  const close = known.filter((k) => k.includes(id) || id.includes(k)).slice(0, 3);
  return close.length ? `Did you mean: ${close.join(", ")}?` : `${known.length} assets in manifest.`;
}
