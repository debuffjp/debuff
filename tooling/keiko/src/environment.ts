import { Window } from "happy-dom";
import type { VirtualClock } from "./clock.js";

/**
 * A headless page for one game: a happy-dom window installed as Node's globals while the game runs,
 * with time and randomness on a {@link VirtualClock}.
 *
 * Nothing is drawn and nothing is heard. WebGL is reported unavailable so engines fall back to
 * Canvas 2D, whose context accepts and ignores every call. Images and other assets load from the
 * project's Vite server, so loaders resolve as they do in a browser.
 */
export interface HeadlessPage {
  readonly window: Window;
  /** Restore Node's globals and close the window. */
  dispose(): Promise<void>;
}

/** Node's own fetch, captured before any page replaces the global with one that resolves page-relative URLs. */
const nodeFetch = globalThis.fetch;

/** Globals Node already has that must point at the page instead while a game runs. */
const FORCE = new Set([
  "Event",
  "EventTarget",
  "CustomEvent",
  "MessageEvent",
  "dispatchEvent",
  "addEventListener",
  "removeEventListener",
  "navigator",
  "location",
]);

/** Node's own globals that the page must not replace. */
const KEEP = new Set([
  "globalThis",
  "global",
  "process",
  "console",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "queueMicrotask",
  "performance",
  "crypto",
  "fetch",
  "Request",
  "Response",
  "Headers",
  "URL",
  "URLSearchParams",
  "TextEncoder",
  "TextDecoder",
  "structuredClone",
  "AbortController",
  "AbortSignal",
  "Blob",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "WebSocket",
  "undefined",
  "NaN",
  "Infinity",
]);

export interface PageOptions {
  /** The Vite server's origin; relative URLs resolve against it. */
  origin: string;
  /** Path of the page, e.g. `/` or `/level.html`. */
  path: string;
  /** The page's markup. Its scripts don't run; the runner imports the game's modules itself. */
  html?: string;
  /** Extra query parameters, e.g. `debuff-scenario=1` so a debuff game waits for steps. */
  search?: Record<string, string>;
  clock: VirtualClock;
}

export function openPage({ origin, path, html = "", search = {}, clock }: PageOptions): HeadlessPage {
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(search)) url.searchParams.set(k, v);
  const window = new Window({ url: url.toString(), width: 960, height: 540, settings: { disableJavaScriptEvaluation: true } });
  const w = window as unknown as Record<string, unknown> & typeof globalThis;
  // The page's markup (canvas, containers, UI), without running its scripts: the runner imports those itself.
  if (html) window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""));

  // Inert rendering and audio, and assets fetched from the dev server.
  const canvasProto = (w.HTMLCanvasElement as unknown as { prototype: Record<string, unknown> }).prototype;
  canvasProto.getContext = function (this: unknown, kind: string) {
    return kind === "2d" ? inertContext2D(this) : null;
  };
  canvasProto.toDataURL = () => "data:image/png;base64,";
  const pageFetch = (input: string | URL | Request, init?: RequestInit) =>
    nodeFetch(typeof input === "string" || input instanceof URL ? new URL(input, url) : input, init);
  const overrides: Record<string, unknown> = {
    fetch: pageFetch,
    Image: headlessImage(pageFetch),
    AudioContext: InertAudioContext,
    webkitAudioContext: InertAudioContext,
    OfflineAudioContext: InertAudioContext,
    OffscreenCanvas: InertOffscreenCanvas,
    // Engines feature-detect Canvas 2D by these constructors before creating a context.
    CanvasRenderingContext2D: class CanvasRenderingContext2D {},
    OffscreenCanvasRenderingContext2D: class OffscreenCanvasRenderingContext2D {},
    Path2D: inert(),
    ImageData: class ImageData {
      readonly data: Uint8ClampedArray;
      constructor(
        readonly width: number,
        readonly height: number,
      ) {
        this.data = new Uint8ClampedArray(Math.max(0, width * height * 4));
      }
    },
    createImageBitmap: (src: { width?: number; height?: number }) =>
      Promise.resolve({ width: src.width ?? 0, height: src.height ?? 0, close() {} }),
    // Frames only run when the test steps the clock.
    requestAnimationFrame: clock.requestAnimationFrame,
    cancelAnimationFrame: clock.cancelAnimationFrame,
    open: () => null,
  };

  const saved = new Map<string, PropertyDescriptor | undefined>();
  const install = (key: string, value: unknown) => {
    if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true, enumerable: false });
  };
  for (const key of pageKeys(w)) {
    if (KEEP.has(key) || key in overrides) continue;
    if (key in globalThis && !FORCE.has(key)) continue;
    let value: unknown;
    try {
      value = w[key];
    } catch {
      continue;
    }
    // Functions like addEventListener must run with the window as `this`; classes must not be bound.
    install(key, typeof value === "function" && /^[a-z]/.test(key) ? (value as (...a: unknown[]) => unknown).bind(w) : value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    install(key, value);
    w[key] = value;
  }
  install("window", w);
  install("self", w);
  install("document", w.document);
  clock.install();

  return {
    window,
    async dispose() {
      clock.uninstall();
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as Record<string, unknown>)[key];
      }
      await window.happyDOM.abort();
      window.close();
    },
  };
}

function pageKeys(w: object): Set<string> {
  const keys = new Set<string>();
  for (let o: object | null = w; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const k of Object.getOwnPropertyNames(o)) if (k !== "constructor" && !k.startsWith("_")) keys.add(k);
  }
  return keys;
}

// ---- inert stand-ins ---------------------------------------------------------------------------

/**
 * Something that accepts any property access, call or construction and does nothing. Reads as 0 in
 * arithmetic and isn't a thenable, so `await` and maths on it behave.
 */
export function inert(): unknown {
  const cache = new Map<PropertyKey, unknown>();
  return new Proxy(() => {}, {
    get(_t, key) {
      if (key === "then") return undefined;
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === "value" || key === "length") return 0;
      if (!cache.has(key)) cache.set(key, inert());
      return cache.get(key);
    },
    set(_t, key, value) {
      cache.set(key, value);
      return true;
    },
    apply: () => inert(),
    construct: () => inert() as object,
  });
}

/** A Canvas 2D context that draws nothing. Methods games read results from return sensible shapes. */
function inertContext2D(canvas: unknown): unknown {
  const state: Record<PropertyKey, unknown> = {
    canvas,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    globalAlpha: 1,
    lineWidth: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true,
    measureText: (text: string) => {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
      return { width: String(text).length * size * 0.6, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 };
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(Math.max(0, w * h * 4)),
    }),
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createConicGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({ setTransform() {} }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getLineDash: () => [],
    isPointInPath: () => false,
    isPointInStroke: () => false,
    getContextAttributes: () => ({ alpha: false }),
  };
  const noop = () => undefined;
  return new Proxy(state, {
    get: (t, key) => (key in t ? t[key] : typeof key === "string" ? noop : undefined),
    set: (t, key, value) => {
      t[key] = value;
      return true;
    },
  });
}

class InertOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(kind: string): unknown {
    return kind === "2d" ? inertContext2D(this) : null;
  }
  convertToBlob(): Promise<Blob> {
    return Promise.resolve(new Blob([]));
  }
  transferToImageBitmap(): unknown {
    return { width: this.width, height: this.height, close() {} };
  }
}

/** A Web Audio context that plays nothing. Nodes and params accept every call. */
class InertAudioContext {
  readonly state = "running";
  readonly sampleRate = 44_100;
  readonly currentTime = 0;
  readonly destination = inert();
  constructor() {
    // biome-ignore lint/correctness/noConstructorReturn: anything not defined here is an inert node or param.
    return new Proxy(this, { get: (t, key) => (key in t ? (t as unknown as Record<PropertyKey, unknown>)[key] : inert()) });
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  decodeAudioData(data: ArrayBuffer): Promise<unknown> {
    return Promise.resolve(this.createBuffer(1, Math.max(1, Math.floor(data.byteLength / 4)), this.sampleRate));
  }
  createBuffer(channels: number, length: number, sampleRate: number): unknown {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
      copyToChannel() {},
      copyFromChannel() {},
    };
  }
}

type PageFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** An `Image` that loads its bytes from the dev server and reports its size (PNG, GIF, JPEG) without decoding pixels. */
function headlessImage(pageFetch: PageFetch) {
  return class HeadlessImage {
    width = 0;
    height = 0;
    naturalWidth = 0;
    naturalHeight = 0;
    complete = false;
    crossOrigin: string | null = null;
    decoding = "auto";
    onload: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    private source = "";
    private readonly listeners = new Map<string, Set<(e: unknown) => void>>();

    constructor(width?: number, height?: number) {
      if (width !== undefined) this.width = width;
      if (height !== undefined) this.height = height;
    }

    get src(): string {
      return this.source;
    }

    set src(value: string) {
      this.source = value;
      this.complete = false;
      pageFetch(value)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${value}`);
          const size = imageSize(new Uint8Array(await res.arrayBuffer()));
          this.width = this.naturalWidth = size.width;
          this.height = this.naturalHeight = size.height;
          this.complete = true;
          this.emit("load");
        })
        .catch((err: unknown) => this.emit("error", err));
    }

    decode(): Promise<void> {
      return Promise.resolve();
    }

    addEventListener(type: string, fn: (e: unknown) => void): void {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)?.add(fn);
    }

    removeEventListener(type: string, fn: (e: unknown) => void): void {
      this.listeners.get(type)?.delete(fn);
    }

    private emit(type: "load" | "error", detail?: unknown): void {
      const event = { type, target: this, error: detail };
      (type === "load" ? this.onload : this.onerror)?.(event);
      for (const fn of this.listeners.get(type) ?? []) fn(event);
    }
  };
}

/** Width and height from an image header. Unknown formats report 0×0. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: signature, then the IHDR chunk with big-endian width and height.
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47) return { width: view.getUint32(16), height: view.getUint32(20) };
  // GIF: "GIF8", then little-endian width and height.
  if (bytes.length >= 10 && view.getUint32(0) === 0x47494638) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  // JPEG: walk the segments to the first start-of-frame marker.
  if (bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1] ?? 0;
      const length = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      }
      i += 2 + length;
    }
  }
  return { width: 0, height: 0 };
}
