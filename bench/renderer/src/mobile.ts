// Self-running benchmark for phones and tablets: the same bench page as run.mjs, driven from inside the
// browser. Each renderer runs in a fresh iframe (a fresh GPU context); results show in a table and copy as JSON.

const SCENES: Record<string, string[]> = {
  particles: ["spryte-bulk", "pixi-particle"],
  mixed: ["spryte", "pixi-sprite"],
  bunny: ["spryte", "spryte-bulk", "pixi-sprite", "pixi-particle", "canvas2d"],
};
const COUNTS = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 400_000, 800_000];
const BUDGET = 1000 / 60;
const FRAMES = 60;

interface Measure {
  count: number;
  frameMs: number;
  p95FrameMs: number;
  submitMs: number;
}
interface Bench {
  ready: boolean;
  measure(count: number, frames?: number): Promise<Measure>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const say = (text: string) => {
  $("status").textContent = text;
};

function environment() {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: navigator.userAgent,
    gpu: ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : gl ? "webgl2 (renderer hidden)" : "no webgl2",
    devicePixelRatio,
    screen: `${screen.width}×${screen.height}`,
    cores: navigator.hardwareConcurrency,
    memoryGB: nav.deviceMemory ?? null,
    note: $<HTMLInputElement>("note").value,
  };
}

async function battery(): Promise<string> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean; level: number }> };
  if (!nav.getBattery) return "not exposed by this browser";
  const b = await nav.getBattery();
  return `${b.charging ? "charging" : "on battery"}, ${Math.round(b.level * 100)}%`;
}

/** Load the bench page for one renderer in a fresh iframe and return its bench API. */
async function open(renderer: string, scene: string): Promise<{ bench: Bench; close: () => void }> {
  const frame = document.createElement("iframe");
  frame.src = `./index.html?renderer=${renderer}&scene=${scene}`;
  $("stage").append(frame);
  const started = performance.now();
  for (;;) {
    const bench = (frame.contentWindow as (Window & { __bench?: Bench }) | null)?.__bench;
    if (bench?.ready) return { bench, close: () => frame.remove() };
    if (performance.now() - started > 30_000) throw new Error(`${renderer} didn't load (no WebGL2?)`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? (s[(s.length - 1) / 2] as number) : ((s[s.length / 2 - 1] as number) + (s[s.length / 2] as number)) / 2;
};

let report: unknown;

async function run(): Promise<void> {
  const rounds = $<HTMLInputElement>("quick").checked ? 1 : 3;
  $<HTMLButtonElement>("run").disabled = true;
  $<HTMLButtonElement>("copy").disabled = true;
  $("results").innerHTML = "";
  const startBattery = await battery();
  const results: Record<string, Record<string, { maxAt60fps: number; counts: Record<number, number[]> }>> = {};
  try {
    for (const [scene, renderers] of Object.entries(SCENES)) {
      results[scene] = {};
      for (let round = 0; round < rounds; round++) {
        // Rotate the order each round so heat and ordering spread evenly.
        const order = renderers.map((_, i) => renderers[(i + round) % renderers.length] as string);
        for (const renderer of order) {
          say(`${scene} · ${renderer} · round ${round + 1}/${rounds}`);
          results[scene][renderer] ??= { maxAt60fps: 0, counts: {} };
          const entry = results[scene][renderer];
          let page: Awaited<ReturnType<typeof open>>;
          try {
            page = await open(renderer, scene);
          } catch (e) {
            say(String(e));
            continue;
          }
          for (const count of COUNTS) {
            const m = await page.bench.measure(count, FRAMES);
            entry.counts[count] ??= [];
            entry.counts[count].push(m.frameMs);
            if (m.frameMs > BUDGET) break;
          }
          page.close();
        }
      }
      for (const entry of Object.values(results[scene])) {
        for (const [count, frames] of Object.entries(entry.counts))
          if (frames.length === rounds && median(frames) <= BUDGET) entry.maxAt60fps = Math.max(entry.maxAt60fps, Number(count));
      }
      show(results);
    }
    report = {
      date: new Date().toISOString(),
      rounds,
      framesPerCount: FRAMES,
      environment: { ...environment(), battery: { start: startBattery, end: await battery() } },
      results,
    };
    say("Done. Copy the results and send them over (or open a pull request in debuffjp/debuff).");
    $<HTMLButtonElement>("copy").disabled = false;
  } finally {
    $<HTMLButtonElement>("run").disabled = false;
  }
}

function show(results: Record<string, Record<string, { maxAt60fps: number; counts: Record<number, number[]> }>>): void {
  const at = (e: { counts: Record<number, number[]> }, n: number) => (e.counts[n] ? `${median(e.counts[n]).toFixed(1)} ms` : "n/a");
  let html = "<tr><th>Scene</th><th>Renderer</th><th>Max @60fps</th><th>10k</th><th>50k</th></tr>";
  for (const [scene, byRenderer] of Object.entries(results))
    for (const [renderer, e] of Object.entries(byRenderer))
      html += `<tr><td>${scene}</td><td>${renderer}</td><td>${e.maxAt60fps.toLocaleString("en")}</td><td>${at(e, 10_000)}</td><td>${at(e, 50_000)}</td></tr>`;
  $("results").innerHTML = html;
}

$("run").addEventListener("click", () => {
  run().catch((e) => say(`Failed: ${e}`));
});
$("copy").addEventListener("click", async () => {
  const text = JSON.stringify(report, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    say("Copied.");
  } catch {
    // Some mobile browsers block the clipboard API; show the text to copy by hand instead.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.width = "100%";
    area.rows = 12;
    document.body.append(area);
    area.select();
    say("Select and copy the text below.");
  }
});
