// Music library size: the JavaScript a minimal "play some music" app ships with each approach, as a Vite
// production build, brotli quality 11 (the same method as bench/size). The libraries install into a temporary
// folder at their pinned versions, so the repo doesn't depend on them.
//   node bench/music-size/run.mjs   → results/<date>.json
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const VERSIONS = { howler: "2.2.4", tone: "15.1.22", plonkjs: "0.2.0" };

/** One minimal app per approach: each plays a short loop the way its docs show. */
const APPS = {
  "howler (audio file)": `import { Howl } from "howler";
new Howl({ src: ["theme.ogg"], loop: true }).play();`,
  "tone (synth)": `import * as Tone from "tone";
const synth = new Tone.Synth().toDestination();
new Tone.Sequence((time, note) => synth.triggerAttackRelease(note, "16n", time), ["C4", "E4", "G4"], "16n").start(0);
Tone.getTransport().start();`,
  "plonkjs (synth)": `import { Player } from "plonkjs";
new Player().play({ bpm: 120, instruments: { lead: { wave: "square" } }, sections: { a: { lead: "C4 E4 G4" } }, order: ["a"] });`,
};

const brotli = (b) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const work = mkdtempSync(join(tmpdir(), "music-size-"));
try {
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "music-size", private: true, type: "module" }));
  execSync(
    `npm install --no-audit --no-fund ${Object.entries(VERSIONS)
      .map(([n, v]) => `${n}@${v}`)
      .join(" ")}`,
    {
      cwd: work,
      stdio: "ignore",
    },
  );
  const results = {};
  for (const [name, code] of Object.entries(APPS)) {
    const root = join(work, name.split(" ")[0]);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "index.html"), `<!doctype html><script type="module" src="./main.js"></script>`);
    writeFileSync(join(root, "main.js"), code);
    const out = join(root, "dist");
    await build({ root, logLevel: "error", build: { outDir: out }, resolve: { preserveSymlinks: false } });
    const assets = join(out, "assets");
    let total = 0;
    for (const f of readdirSync(assets).filter((f) => f.endsWith(".js"))) total += brotli(readFileSync(join(assets, f)));
    results[name] = { brotliBytes: total, kB: +(total / 1000).toFixed(1) };
    console.log(`${name.padEnd(22)} ${(total / 1000).toFixed(1)} kB`);
  }
  mkdirSync(join(here, "results"), { recursive: true });
  const file = join(here, "results", `${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(
    file,
    `${JSON.stringify({ date: new Date().toISOString(), versions: VERSIONS, method: "Vite production build, all JS, brotli quality 11", results }, null, 2)}\n`,
  );
  console.log(`\nSaved ${file}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
