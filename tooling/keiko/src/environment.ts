import { Window } from "happy-dom";
import { realNow, sleep, type VirtualClock, yieldTurn } from "./clock.js";
import { inertWebGL, webglClasses } from "./webgl.js";
import { inlineWorkerClass } from "./worker.js";

/**
 * A headless page for one game: a happy-dom window installed as Node's globals while the game runs,
 * with time and randomness on a {@link VirtualClock}.
 *
 * Nothing is drawn and nothing is heard. Canvas 2D and WebGL contexts accept and ignore every call
 * (shaders compile, framebuffers are complete, reads return zeros), so engines boot whichever renderer
 * they prefer. Images and other assets load from the project's Vite server, so loaders resolve as they
 * do in a browser. The page has a real size, so engines that map pointer positions through the canvas's
 * bounding box get sensible coordinates.
 */
export interface HeadlessPage {
  readonly window: Window;
  /** Requests (fetches and images) the page has started and not yet finished. */
  readonly inflight: number;
  /**
   * Wait (in real time) until no request is in flight and promise callbacks have run, or `timeout` ms pass.
   * Resolves to true when the page went quiet.
   */
  settle(timeout?: number): Promise<boolean>;
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
  /** Offer WebGL contexts. When false, `getContext("webgl2")` returns null and engines fall back to Canvas 2D. Default true. */
  webgl?: boolean;
  /** Other work that counts as loading, such as the game's dynamic imports. */
  busy?: () => boolean;
  /** The window's inner size. Default 960×540. */
  viewport?: { width: number; height: number };
  clock: VirtualClock;
}

export function openPage({
  origin,
  path,
  html = "",
  search = {},
  clock,
  webgl = true,
  busy = () => false,
  viewport = { width: 960, height: 540 },
}: PageOptions): HeadlessPage {
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(search)) url.searchParams.set(k, v);
  const window = new Window({
    url: url.toString(),
    width: viewport.width,
    height: viewport.height,
    settings: { disableJavaScriptEvaluation: true },
  });
  const w = window as unknown as Record<string, unknown> & typeof globalThis;
  // The page's markup (canvas, containers, UI), without running its scripts: the runner imports those itself.
  if (html) window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""));

  // Inert rendering and audio, and assets fetched from the dev server.
  const canvasProto = (w.HTMLCanvasElement as unknown as { prototype: Record<string, unknown> }).prototype;
  const gl = webglClasses();
  const contexts = new WeakMap<object, Map<string, unknown>>();
  // One context per canvas and kind, as in browsers: engines call getContext repeatedly.
  const getContext = (canvas: object, kind: string): unknown => {
    let byKind = contexts.get(canvas);
    if (!byKind) {
      byKind = new Map();
      contexts.set(canvas, byKind);
    }
    if (!byKind.has(kind)) {
      const sized = canvas as { width: number; height: number };
      byKind.set(
        kind,
        kind === "2d"
          ? inertContext2D(canvas)
          : webgl && kind === "webgl2"
            ? inertWebGL(sized, 2, (gl.WebGL2RenderingContext as { prototype: object }).prototype)
            : webgl && (kind === "webgl" || kind === "experimental-webgl")
              ? inertWebGL(sized, 1, (gl.WebGLRenderingContext as { prototype: object }).prototype)
              : null,
      );
    }
    return byKind.get(kind);
  };
  canvasProto.getContext = function (this: object, kind: string) {
    return getContext(this, kind);
  };
  // A canvas's box on the page is its CSS size (style.width/height when set, as engines do for high-DPI
  // canvases), else its pixel size, at the origin. Pointer coordinates are in that box, like clientX.
  const cssSize = (canvas: { width: number; height: number; style?: { width?: string; height?: string } }) => {
    const px = (v: string | undefined) => (v && /^[\d.]+px$/.test(v) ? Number.parseFloat(v) : undefined);
    return { width: px(canvas.style?.width) ?? (canvas.width || 300), height: px(canvas.style?.height) ?? (canvas.height || 150) };
  };
  canvasProto.getBoundingClientRect = function (this: { width: number; height: number }) {
    const { width, height } = cssSize(this);
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
  };
  for (const [prop, axis] of [
    ["clientWidth", "width"],
    ["clientHeight", "height"],
    ["offsetWidth", "width"],
    ["offsetHeight", "height"],
  ] as const) {
    Object.defineProperty(canvasProto, prop, {
      configurable: true,
      get(this: { width: number; height: number }) {
        return cssSize(this)[axis];
      },
    });
  }
  InertOffscreenCanvas.contexts = getContext;
  canvasProto.toDataURL = () => "data:image/png;base64,";
  // Every request the game makes is counted, so the runner can wait for loading to finish.
  let inflight = 0;
  const track = <T>(p: Promise<T>): Promise<T> => {
    inflight++;
    return p.finally(() => {
      inflight--;
    });
  };
  // Object URLs (`blob:`) for any Blob-like value (Node's or happy-dom's), readable by fetch, <img> and workers.
  const objectURLs = new Map<string, { arrayBuffer(): Promise<ArrayBuffer>; type?: string }>();
  let objectURLCount = 0;
  class PageURL extends URL {
    static override createObjectURL(blob: Blob | MediaSource): string {
      const id = `blob:${url.origin}/keiko-${++objectURLCount}`;
      objectURLs.set(id, blob as unknown as { arrayBuffer(): Promise<ArrayBuffer>; type?: string });
      return id;
    }
    static override revokeObjectURL(id: string): void {
      objectURLs.delete(id);
    }
  }
  const pageFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const target = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const blob = objectURLs.get(target);
    if (blob) {
      return track(blob.arrayBuffer().then((bytes) => new Response(bytes, { headers: blob.type ? { "content-type": blob.type } : {} })));
    }
    return track(nodeFetch(typeof input === "string" || input instanceof URL ? new URL(input, url) : input, init));
  };
  // XMLHttpRequest (Phaser's loader uses it) counts as loading too.
  const xhrProto = (w.XMLHttpRequest as unknown as { prototype: Record<string, unknown> } | undefined)?.prototype;
  if (xhrProto) {
    const send = xhrProto.send as (this: EventTarget, body?: unknown) => void;
    xhrProto.send = function (this: EventTarget, body?: unknown) {
      inflight++;
      this.addEventListener("loadend", () => inflight--, { once: true });
      return send.call(this, body);
    };
  }
  // ImageBitmaps report the size of what they were made from: an image, canvas or ImageData, or a Blob's header.
  const createImageBitmap = async (source: unknown): Promise<unknown> => {
    let size = { width: 0, height: 0 };
    if (source instanceof Blob) size = imageSize(new Uint8Array(await source.arrayBuffer()));
    else if (source && typeof source === "object") {
      const s = source as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
      size = { width: s.naturalWidth || s.width || 0, height: s.naturalHeight || s.height || 0 };
    }
    return { ...size, close() {} };
  };
  const overrides: Record<string, unknown> = {
    fetch: pageFetch,
    URL: PageURL,
    Image: headlessImage(window as unknown as Window, pageFetch),
    ...(webgl ? gl : {}),
    AudioContext: InertAudioContext,
    AudioBuffer: InertAudioBuffer,
    AudioNode: InertAudioNode,
    AudioParam: InertAudioNode,
    GainNode: InertAudioNode,
    AudioBufferSourceNode: InertAudioNode,
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
    createImageBitmap,
    Worker: inlineWorkerClass({ fetch: pageFetch as typeof fetch, createImageBitmap }, url.toString()),
    // Frames and timers only run when the test steps the clock.
    requestAnimationFrame: clock.requestAnimationFrame,
    cancelAnimationFrame: clock.cancelAnimationFrame,
    setTimeout: clock.setTimeout,
    setInterval: clock.setInterval,
    clearTimeout: clock.clearTimeout,
    clearInterval: clock.clearInterval,
    FontFace: InertFontFace,
    requestIdleCallback: clock.requestIdleCallback,
    cancelIdleCallback: clock.cancelIdleCallback,
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
  // Fonts "load" instantly and every family is available: text metrics come from the inert 2D context anyway.
  if (!("fonts" in w.document)) Object.defineProperty(w.document, "fonts", { configurable: true, value: inertFontSet() });
  // Media elements play the formats browsers do (audio libraries check before loading .ogg, .mp3…).
  const media = (w.HTMLMediaElement as unknown as { prototype: Record<string, unknown> } | undefined)?.prototype;
  if (media) {
    media.canPlayType = (type: string) =>
      /^(audio|video)\/(ogg|mpeg|mp3|mp4|wav|x-wav|webm|aac|x-m4a|flac)\b/.test(type) ? "probably" : "";
    media.play = () => Promise.resolve();
    media.pause = () => {};
    media.load = () => {};
  }
  // No gamepads are connected, as in a browser with none plugged in.
  if (typeof (w.navigator as { getGamepads?: unknown }).getGamepads !== "function") {
    Object.defineProperty(w.navigator, "getGamepads", { configurable: true, value: () => [null, null, null, null] });
  }
  install("window", w);
  install("self", w);
  install("document", w.document);
  clock.install();

  return {
    window,
    get inflight() {
      return inflight + (busy() ? 1 : 0);
    },
    async settle(timeout = 10_000) {
      // Real time: the game's clock is installed, so Date.now() doesn't move while we wait.
      const deadline = realNow() + timeout;
      // Quiet means no requests for three turns in a row: a finished load often starts the next one.
      let quietTurns = 0;
      while (quietTurns < 3) {
        const loading = inflight > 0 || busy();
        // While loading, poll gently; otherwise just give promise callbacks a turn (cheap: no timer).
        if (loading) await sleep(2);
        else await yieldTurn();
        quietTurns = loading ? 0 : quietTurns + 1;
        if (realNow() > deadline) return false;
      }
      return true;
    },
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
  /** Set by the page, so offscreen canvases get the same contexts as on-screen ones. */
  static contexts: (canvas: object, kind: string) => unknown = (canvas, kind) => (kind === "2d" ? inertContext2D(canvas) : null);
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(kind: string): unknown {
    return InertOffscreenCanvas.contexts(this, kind);
  }
  convertToBlob(): Promise<Blob> {
    return Promise.resolve(new Blob([]));
  }
  transferToImageBitmap(): unknown {
    return { width: this.width, height: this.height, close() {} };
  }
}

/** A `FontFace` that loads instantly. */
class InertFontFace {
  status = "loaded";
  readonly loaded: Promise<this> = Promise.resolve(this);
  constructor(
    readonly family: string,
    readonly source?: unknown,
  ) {}
  load(): Promise<this> {
    return this.loaded;
  }
}

/** `document.fonts`: every check passes and every load is already done. */
function inertFontSet() {
  const faces = new Set<unknown>();
  return {
    status: "loaded",
    ready: Promise.resolve(),
    check: () => true,
    load: () => Promise.resolve([]),
    add(face: unknown) {
      faces.add(face);
      return this;
    },
    delete: (face: unknown) => faces.delete(face),
    has: (face: unknown) => faces.has(face),
    clear: () => faces.clear(),
    forEach: (fn: (face: unknown) => void) => faces.forEach(fn),
    get size() {
      return faces.size;
    },
    [Symbol.iterator]: () => faces[Symbol.iterator](),
    addEventListener() {},
    removeEventListener() {},
  };
}

/** An `AudioBuffer` of silence, with real channel data. */
class InertAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly channels: Float32Array[];
  constructor(options: { numberOfChannels?: number; length: number; sampleRate: number }) {
    this.numberOfChannels = options.numberOfChannels ?? 1;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.channels = Array.from({ length: this.numberOfChannels }, () => new Float32Array(options.length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number): Float32Array {
    return this.channels[channel] ?? new Float32Array(this.length);
  }
  copyToChannel(): void {}
  copyFromChannel(): void {}
}

/** Audio node classes exist for `instanceof` checks; real nodes come from the context and accept every call. */
class InertAudioNode {}

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
  /** Both forms work: the promise, and the older success/error callbacks some engines still use. */
  decodeAudioData(data: ArrayBuffer, onSuccess?: (buffer: unknown) => void): Promise<unknown> {
    const buffer = this.createBuffer(1, Math.max(1, Math.floor((data?.byteLength ?? 4) / 4)), this.sampleRate);
    onSuccess?.(buffer);
    return Promise.resolve(buffer);
  }
  createBuffer(channels: number, length: number, sampleRate: number): unknown {
    return new InertAudioBuffer({ numberOfChannels: channels, length, sampleRate });
  }
}

type PageFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * `new Image()` as a real `<img>` element (so `setAttribute`, `style` and `instanceof HTMLImageElement` work)
 * whose `src` loads its bytes from the dev server and reports the image's size (PNG, GIF, JPEG) without
 * decoding pixels. `load` and `error` fire as DOM events, which also calls `onload` and `onerror`.
 */
function headlessImage(window: Window, pageFetch: PageFetch) {
  const HTMLImage = (window as unknown as { HTMLImageElement: { prototype: object } }).HTMLImageElement;
  function wire(img: HTMLImageElement): HTMLImageElement {
    let source = "";
    let size = { width: 0, height: 0 };
    let explicit: { width?: number; height?: number } = {};
    let complete = false;
    const fire = (type: "load" | "error") => img.dispatchEvent(new (window as unknown as { Event: typeof Event }).Event(type));
    const load = (value: string) => {
      source = value;
      complete = false;
      // The body is read inside the tracked fetch, so settle() also waits for the image to "decode".
      pageFetch(value)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${value}`);
          size = imageSize(new Uint8Array(await res.arrayBuffer()));
          complete = true;
          fire("load");
        })
        .catch(() => fire("error"));
    };
    const prop = (name: string, get: () => unknown, set?: (v: never) => void) =>
      Object.defineProperty(img, name, { configurable: true, enumerable: true, get, ...(set ? { set } : {}) });
    prop("src", () => source, load);
    prop("currentSrc", () => source);
    prop("complete", () => complete);
    prop("naturalWidth", () => size.width);
    prop("naturalHeight", () => size.height);
    prop(
      "width",
      () => explicit.width ?? size.width,
      (v: number) => {
        explicit = { ...explicit, width: Number(v) };
      },
    );
    prop(
      "height",
      () => explicit.height ?? size.height,
      (v: number) => {
        explicit = { ...explicit, height: Number(v) };
      },
    );
    // happy-dom fires its own load event when the src attribute changes, so keiko keeps src to itself.
    const setAttribute = img.setAttribute.bind(img);
    const getAttribute = img.getAttribute.bind(img);
    img.setAttribute = (name: string, value: string) => (name.toLowerCase() === "src" ? load(String(value)) : setAttribute(name, value));
    img.getAttribute = (name: string) => (name.toLowerCase() === "src" ? source || null : getAttribute(name));
    img.decode = () => Promise.resolve();
    return img;
  }
  function HeadlessImage(width?: number, height?: number): HTMLImageElement {
    const img = wire(window.document.createElement("img") as unknown as HTMLImageElement);
    if (width !== undefined) img.width = width;
    if (height !== undefined) img.height = height;
    return img;
  }
  HeadlessImage.prototype = HTMLImage.prototype;
  // Images made with document.createElement("img") load the same way.
  const createElement = window.document.createElement.bind(window.document);
  (window.document as unknown as { createElement: (tag: string, o?: unknown) => unknown }).createElement = (tag: string, o?: unknown) => {
    const el = createElement(tag, o as ElementCreationOptions);
    return tag.toLowerCase() === "img" && !("__keiko" in el)
      ? Object.assign(wire(el as unknown as HTMLImageElement), { __keiko: true })
      : el;
  };
  return HeadlessImage;
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
