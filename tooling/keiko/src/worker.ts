import { resolveObjectURL } from "node:buffer";

type Listener = (event: { data?: unknown; error?: unknown; message?: string }) => void;

/** What a worker script sees as its global scope, beyond Node's own globals. */
export interface WorkerScopeGlobals {
  fetch: typeof fetch;
  createImageBitmap: (source: unknown) => Promise<unknown>;
}

/**
 * `Worker`, run inline: the worker's script runs on the same thread in its own scope (`self`,
 * `postMessage`, `onmessage`), and messages are delivered asynchronously, like a browser's. Enough for
 * the workers engines use for loading (PixiJS decodes images in one); module workers and `importScripts`
 * aren't supported and report an `error` event.
 */
/** The parts of the `Worker` interface keiko implements. */
export interface InlineWorker {
  onmessage: Listener | null;
  onerror: Listener | null;
  postMessage(data: unknown): void;
  terminate(): void;
  addEventListener(type: string, fn: Listener): void;
  removeEventListener(type: string, fn: Listener): void;
}

export function inlineWorkerClass(
  globals: WorkerScopeGlobals,
  base: string,
): new (
  url: string | URL,
  options?: { type?: string },
) => InlineWorker {
  return class Worker {
    onmessage: Listener | null = null;
    onerror: Listener | null = null;
    onmessageerror: Listener | null = null;
    readonly #listeners = new Map<string, Set<Listener>>();
    readonly #scope: Record<string, unknown> & { onmessage?: Listener | null } = {};
    readonly #scopeListeners = new Set<Listener>();
    #terminated = false;
    readonly #ready: Promise<void>;

    constructor(url: string | URL, options?: { type?: string }) {
      const toMain = (data: unknown) => queueMicrotask(() => this.#emit("message", { data }));
      Object.assign(this.#scope, {
        postMessage: toMain,
        close: () => this.terminate(),
        addEventListener: (type: string, fn: Listener) => type === "message" && this.#scopeListeners.add(fn),
        removeEventListener: (_type: string, fn: Listener) => this.#scopeListeners.delete(fn),
        importScripts: () => {
          throw new Error("keiko's inline workers don't support importScripts");
        },
        fetch: globals.fetch,
        createImageBitmap: globals.createImageBitmap,
      });
      this.#scope.self = this.#scope;
      this.#ready = (async () => {
        if (options?.type === "module") throw new Error("keiko's inline workers don't support module workers");
        const code = await scriptText(String(url), base, globals.fetch);
        const run = new Function("self", "postMessage", "fetch", "createImageBitmap", "importScripts", "close", code);
        run(this.#scope, this.#scope.postMessage, globals.fetch, globals.createImageBitmap, this.#scope.importScripts, this.#scope.close);
      })().catch((error: unknown) => {
        this.#emit("error", { error, message: error instanceof Error ? error.message : String(error) });
      });
    }

    postMessage(data: unknown): void {
      if (this.#terminated) return;
      void this.#ready.then(() => {
        if (this.#terminated) return;
        const event = { data };
        try {
          this.#scope.onmessage?.(event);
          for (const fn of this.#scopeListeners) fn(event);
        } catch (error) {
          this.#emit("error", { error, message: error instanceof Error ? error.message : String(error) });
        }
      });
    }

    terminate(): void {
      this.#terminated = true;
    }

    addEventListener(type: string, fn: Listener): void {
      if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
      this.#listeners.get(type)?.add(fn);
    }

    removeEventListener(type: string, fn: Listener): void {
      this.#listeners.get(type)?.delete(fn);
    }

    #emit(type: "message" | "error", event: { data?: unknown; error?: unknown; message?: string }): void {
      if (this.#terminated && type === "message") return;
      (type === "message" ? this.onmessage : this.onerror)?.(event);
      for (const fn of this.#listeners.get(type) ?? []) fn(event);
    }
  };
}

async function scriptText(url: string, base: string, pageFetch: typeof fetch): Promise<string> {
  // Node's own object URLs (blob:nodedata:…); the page's object URLs resolve through its fetch.
  const nodeBlob = url.startsWith("blob:nodedata:") ? resolveObjectURL(url) : undefined;
  if (nodeBlob) return nodeBlob.text();
  const res = await pageFetch(url.startsWith("blob:") ? url : new URL(url, base));
  if (!res.ok) throw new Error(`HTTP ${res.status} loading worker ${url}`);
  return res.text();
}
