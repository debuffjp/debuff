// Draws the timing chart from a results file: node bench/music-timing/chart.mjs [results.json] [out.svg]
// One strip per condition: every note of round 1, placed by when it was due, at its distance from the beat.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const latest = readdirSync(join(here, "results"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .at(-1);
const input = process.argv[2] ?? join(here, "results", latest);
const output = process.argv[3] ?? join(here, "results", "timing.svg");
const r = JSON.parse(readFileSync(input, "utf8"));
const round = r.results[0];
const STEP = 60 / r.bpm / 4;

const W = 760;
const left = 64;
const right = 24;
const plotW = W - left - right;
const stripH = 92;
const gap = 44;
const top = 84;
const conditions = Object.keys(round);
const H = top + conditions.length * (stripH + gap) + 30;
const MAX = 260;
// Square-root scale: a 5 ms error and a 250 ms one both stay readable.
const y = (ms) => stripH - (Math.sqrt(Math.min(MAX, Math.abs(ms))) / Math.sqrt(MAX)) * stripH;
const x = (seconds) => left + (seconds / r.seconds) * plotW;
const COLORS = { plonk: "#cffb2d", "frame loop": "#f472b6" };
const LABEL = {
  idle: "idle",
  jank: `jank: a ${r.conditions.jank.block} ms block every ${r.conditions.jank.every} ms`,
  stall: `stall: a ${r.conditions.stall.block} ms block every ${r.conditions.stall.every / 1000} s`,
};

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" role="img" aria-label="How far each note lands from the beat, plonk against a frame-loop sequencer">
<rect width="${W}" height="${H}" rx="10" fill="#0f1115"/>
<text x="${left}" y="26" fill="#d4d7dd" font-size="15" font-weight="600">How far each note lands from the beat</text>
<text x="${left}" y="44" fill="#8b909a" font-size="11">${r.cpu} · Chrome ${r.browser} · steady sixteenths at ${r.bpm} bpm · round 1 of ${r.rounds} · lower is better</text>
`;
let legendX = left;
for (const [name, color] of Object.entries(COLORS)) {
  svg += `<circle cx="${legendX + 5}" cy="59" r="4" fill="${color}"/><text x="${legendX + 14}" y="63" fill="#d4d7dd" font-size="11">${name}</text>\n`;
  legendX += 110;
}
svg += `<text x="${legendX + 4}" y="63" fill="#cffb2d" font-size="12">×</text><text x="${legendX + 16}" y="63" fill="#d4d7dd" font-size="11">note plonk skipped instead of playing late</text>\n`;

conditions.forEach((c, i) => {
  const oy = top + i * (stripH + gap) + 14;
  svg += `<g transform="translate(0 ${oy})">\n<text x="${left}" y="-16" fill="#d4d7dd" font-size="12" font-weight="600">${LABEL[c] ?? c}</text>\n`;
  for (const ms of [0, 10, 50, 250]) {
    svg += `<line x1="${left}" x2="${W - right}" y1="${y(ms)}" y2="${y(ms)}" stroke="#262a33"/><text x="${left - 8}" y="${y(ms) + 4}" fill="#8b909a" font-size="10" text-anchor="end">${ms} ms</text>\n`;
  }
  for (const [engine, color] of Object.entries(COLORS)) {
    const s = round[c][engine];
    s.errorsMs.forEach((e, k) => {
      // The frame loop's k-th note was due at step k; plonk's notes sit on their own steps (errors near 0).
      const due = engine === "plonk" ? null : k * STEP;
      const at = due ?? null;
      if (at === null) return;
      svg += `<circle cx="${x(at).toFixed(1)}" cy="${y(e).toFixed(1)}" r="2.4" fill="${color}" fill-opacity="0.85"/>`;
    });
    if (engine === "plonk") {
      // plonk's played notes: one per step that wasn't dropped.
      const dropped = new Set(s.droppedAt.map((t) => Math.round(t / STEP)));
      let k = 0;
      for (const e of s.errorsMs) {
        while (dropped.has(k)) k++;
        svg += `<circle cx="${x(k * STEP).toFixed(1)}" cy="${y(e).toFixed(1)}" r="2.4" fill="${color}" fill-opacity="0.85"/>`;
        k++;
      }
      for (const t of s.droppedAt)
        svg += `<text x="${x(t).toFixed(1)}" y="${stripH + 13}" fill="${color}" font-size="12" text-anchor="middle">×</text>`;
    }
    svg += "\n";
  }
  svg += `</g>\n`;
});
const axisY = H - 12;
for (let t = 0; t <= r.seconds; t += 2)
  svg += `<text x="${x(t)}" y="${axisY}" fill="#8b909a" font-size="10" text-anchor="middle">${t} s</text>`;
svg += "\n</svg>\n";
writeFileSync(output, svg);
console.log(output);
