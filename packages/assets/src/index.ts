/** Runtime asset manifest and loader. The build-time compiler (see `@debuffjp/cli`)
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
  /** Region of `src` holding this image when it was packed into an atlas. */
  rect?: { x: number; y: number; w: number; h: number };
  bytes?: number;
  /** Content hash from the build; appended as `?v=` so a redeploy never mixes cached files. */
  hash?: string;
}

export interface AssetManifest {
  version: 1;
  assets: Record<string, AssetEntry>;
}

export interface LoadProgress {
  loaded: number;
  total: number;
}

/** An image region, structurally compatible with `@debuffjp/core`'s `Frame`. */
export interface ImageFrame {
  image: HTMLImageElement;
  x: number;
  y: number;
  w: number;
  h: number;
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
  /** Loads by URL, so assets packed into one atlas share a single request and image. */
  private readonly byUrl = new Map<string, Promise<Loaded>>();

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

  /**
   * The whole image element. For images packed into an atlas this would be the atlas, so it throws;
   * use `frame(id)` (works for both) with `draw.sprite`.
   */
  image(id: string): HTMLImageElement {
    if (this.entry(id).rect) {
      throw new AssetError(
        id,
        `Asset "${id}" is packed into an atlas. Use assets.frame("${id}") (or frames() for sprite sheets) with draw.sprite.`,
      );
    }
    return this.get(id, "image") as HTMLImageElement;
  }

  /** The image region for an asset: `{ image, x, y, w, h }`, ready for `draw.sprite`. Works whether or not it was atlased. */
  frame(id: string): ImageFrame {
    const image = this.get(id, "image") as HTMLImageElement;
    const rect = this.entry(id).rect;
    return rect ? { image, ...rect } : { image, x: 0, y: 0, w: image.naturalWidth || image.width, h: image.naturalHeight || image.height };
  }

  /**
   * Frames of a sprite sheet declared with the `name@WxH.png` convention, row-major, ready for
   * `new Sprite({ frames })`. Works whether or not the sheet was atlased.
   */
  frames(id: string): ImageFrame[] {
    const whole = this.frame(id);
    const grid = this.entry(id).grid;
    if (!grid) return [whole];
    const out: ImageFrame[] = [];
    for (let y = 0; y + grid.frameHeight <= whole.h; y += grid.frameHeight) {
      for (let x = 0; x + grid.frameWidth <= whole.w; x += grid.frameWidth) {
        out.push({ image: whole.image, x: whole.x + x, y: whole.y + y, w: grid.frameWidth, h: grid.frameHeight });
      }
    }
    return out;
  }

  json<T = unknown>(id: string): T {
    return this.get(id, "json") as T;
  }

  /** Raw encoded audio; decode with `@debuffjp/audio`. */
  audio(id: string): ArrayBuffer {
    return this.get(id, "audio") as ArrayBuffer;
  }

  text(id: string): string {
    return this.get(id, "text") as string;
  }

  /**
   * The asset's URL without downloading it, for streaming: `audio.stream(assets.url("music/theme"))`.
   * Keep long tracks in a group you never `load()` (e.g. `assets/music/`) so they aren't fetched twice.
   */
  url(id: string): string {
    const e = this.entry(id);
    return this.base + e.src + (e.hash ? `?v=${e.hash}` : "");
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
    const url = this.url(id);
    let shared = this.byUrl.get(url);
    if (!shared) {
      shared = loadOne(entry.type, url);
      this.byUrl.set(url, shared);
      shared.catch(() => this.byUrl.delete(url));
    }
    const p = shared
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
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image failed to load or decode"));
      img.src = url;
    });
    // decode() avoids a hitch on first draw, but it can stall indefinitely in background tabs and
    // throttled iframes. The load event already guarantees the image is usable, so it's only a hint.
    img.decode().catch(() => {});
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
