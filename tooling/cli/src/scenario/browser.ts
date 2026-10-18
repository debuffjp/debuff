// Functions in this file are serialised by Playwright and run inside the page.
// They must be self-contained: no imports, no closures over module scope.

type Hooks = Record<string, (...args: unknown[]) => unknown>;

/** Call `window.__DEBUFF_DEV__[method](...args)`. */
export function callHook([method, args]: [string, unknown[]]): unknown {
  const hooks = (window as unknown as { __DEBUFF_DEV__?: Hooks }).__DEBUFF_DEV__;
  if (!hooks) throw new Error("window.__DEBUFF_DEV__ is missing. Call exposeDevHooks(game, { input }) in dev builds.");
  const fn = hooks[method];
  if (typeof fn !== "function") throw new Error(`__DEBUFF_DEV__.${method} is not a function`);
  return fn(...args);
}

export function hooksReady(): boolean {
  return (window as unknown as { __DEBUFF_DEV__?: { controlled?: boolean } }).__DEBUFF_DEV__?.controlled === true;
}

/**
 * Fraction of pixels whose RGB differs by more than `threshold` (sum of channel deltas), 1 if sizes differ,
 * plus a PNG data URL highlighting the differing pixels in red over a faded copy of `a`.
 */
export async function diffImages([a, b, threshold]: [string, string, number]): Promise<{ ratio: number; image?: string }> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return { ratio: 1 };
  const read = (img: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    ctx.drawImage(img, 0, 0);
    return { canvas, ctx, image: ctx.getImageData(0, 0, canvas.width, canvas.height) };
  };
  const out = read(ia);
  const da = out.image.data;
  const db = read(ib).image.data;
  let different = 0;
  for (let i = 0; i < da.length; i += 4) {
    const delta =
      Math.abs((da[i] ?? 0) - (db[i] ?? 0)) + Math.abs((da[i + 1] ?? 0) - (db[i + 1] ?? 0)) + Math.abs((da[i + 2] ?? 0) - (db[i + 2] ?? 0));
    if (delta > threshold) {
      different++;
      da[i] = 255;
      da[i + 1] = 0;
      da[i + 2] = 0;
    } else {
      da[i + 3] = 64;
    }
  }
  out.ctx.putImageData(out.image, 0, 0);
  return { ratio: different / (da.length / 4), image: out.canvas.toDataURL("image/png") };
}

/**
 * Step one tick at a time until every condition holds or `within` ticks pass. Returns the ticks taken and
 * whether the conditions were met. (A compact, self-contained twin of `compare`; failures are explained in
 * Node with the full `compare`.)
 */
export function stepUntil([conditions, within]: [Record<string, Record<string, unknown>>, number]): { ticks: number; met: boolean } {
  const hooks = (window as unknown as { __DEBUFF_DEV__?: Hooks }).__DEBUFF_DEV__;
  if (!hooks) throw new Error("window.__DEBUFF_DEV__ is missing. Call exposeDevHooks(game, { input }) in dev builds.");
  const pick = (o: unknown, path: string) => {
    const v = path.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), o);
    return v === undefined && path.startsWith("events.") ? 0 : v;
  };
  const holds = (actual: unknown, c: Record<string, unknown>) => {
    if ("eq" in c && JSON.stringify(actual) !== JSON.stringify(c.eq)) return false;
    const n = actual as number;
    if (c.gt !== undefined && !(typeof n === "number" && n > (c.gt as number))) return false;
    if (c.gte !== undefined && !(typeof n === "number" && n >= (c.gte as number))) return false;
    if (c.lt !== undefined && !(typeof n === "number" && n < (c.lt as number))) return false;
    if (c.lte !== undefined && !(typeof n === "number" && n <= (c.lte as number))) return false;
    const approx = c.approx as [number, number] | undefined;
    if (approx && !(typeof n === "number" && Math.abs(n - approx[0]) <= approx[1])) return false;
    return true;
  };
  const met = () => {
    const state = hooks.state?.();
    return Object.entries(conditions).every(([path, c]) => holds(pick(state, path), c));
  };
  for (let ticks = 0; ticks <= within; ticks++) {
    if (met()) return { ticks, met: true };
    if (ticks < within) hooks.step?.(1);
  }
  return { ticks: within, met: false };
}
