// keiko and myaku against the real open-source games in keiko's "Real games" table: `node compat/real.mjs`.
// Opt-in and local, never in CI. Each repo is cloned at a pinned commit into compat/.real/ (gitignored),
// gets the small __KEIKO__ hook in compat/real/<game>/hook.patch, and is played by the tests next to it.
// myaku then records each one for 3 s in your installed Chrome or Edge, with no change to the game.
// Run `npm run compat` once first, so keiko and myaku are built and installed in compat/node_modules.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runTests } from "keiko/runner";
import { createServer } from "vite";
import { record } from "../packages/myaku/dist-cli/record.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const cache = `${here}.real/`;

const repos = {
  "phaser-by-example": { url: "https://github.com/phaserjs/phaser-by-example", commit: "df1a56d8c7940d8f8642da3b12ad44c58a7863ce" },
  "open-games": { url: "https://github.com/pixijs/open-games", commit: "83b46762a5572430a94c01091353d0fa3d9909a4" },
};
// `assets` builds the PixiJS games' public/assets with AssetPack, as their own `npm start` does.
// `spans` are the engine spans myaku's README promises, for the screen each game opens on.
const games = {
  runner: { repo: "phaser-by-example", dir: "runner", spans: ["update", "update:game", "render"] },
  starshake: { repo: "phaser-by-example", dir: "starshake", spans: ["update", "update:splash", "render"] },
  "puzzling-potions": { repo: "open-games", dir: "puzzling-potions", assets: true, spans: ["update", "render"] },
  "bubbo-bubbo": { repo: "open-games", dir: "bubbo-bubbo", assets: true, spans: ["update", "render"] },
};

const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
const only = process.argv.slice(2);
const names = Object.keys(games).filter((g) => only.length === 0 || only.includes(g));

mkdirSync(cache, { recursive: true });
for (const name of names) {
  const { repo, dir, assets } = games[name];
  const checkout = `${cache}${repo}`;
  if (!existsSync(checkout)) {
    sh("git", ["clone", "--quiet", repos[repo].url, checkout]);
  }
  const root = `${checkout}/${dir}`;
  const stamp = `${root}/.keiko-ready`;
  if (!existsSync(stamp)) {
    sh("git", ["checkout", "--quiet", "--force", repos[repo].commit, "--", dir], checkout);
    sh("git", ["apply", `${here}real/${name}/hook.patch`], checkout);
    sh("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], root);
    if (assets) sh("npx", ["assetpack"], root);
    execFileSync(process.execPath, ["-e", `require("fs").writeFileSync(${JSON.stringify(stamp)}, "")`]);
  }
  // The tests are copied in fresh each run, so edits to compat/real/ are picked up.
  rmSync(`${root}/tests`, { recursive: true, force: true });
  mkdirSync(`${root}/tests`, { recursive: true });
  for (const f of readdirSync(`${here}real/${name}`)) if (f.endsWith(".test.js")) cpSync(`${here}real/${name}/${f}`, `${root}/tests/${f}`);
}

let failed = false;
for (const name of names) {
  const { repo, dir, spans } = games[name];
  const root = `${cache}${repo}/${dir}`;
  const keiko = [];
  const report = await runTests({ root });
  for (const t of report.results) if (t.status === "fail") keiko.push(`${t.name}: ${t.error?.message.split("\n")[0]}`);
  for (const o of report.outside) keiko.push(`outside a test: ${o.message.split("\n")[0]}`);

  const myaku = [];
  let detail = "";
  const server = await createServer({ root, logLevel: "silent", server: { port: 0 } });
  await server.listen();
  try {
    const r = await record({ target: server.resolvedUrls.local[0], seconds: 3 });
    if (r.frames < 30) myaku.push(`only ${r.frames} frames in 3 s`);
    for (const w of r.warnings) myaku.push(`warning: ${w}`);
    if (!(r.perFrame.draws > 0)) myaku.push("no draw calls counted");
    for (const s of spans) if (!(s in r.spans)) myaku.push(`no "${s}" span (got ${Object.keys(r.spans).join(", ") || "none"})`);
    detail = `${r.frames} frames, p95 ${r.intervalMs.p95} ms, ${r.perFrame.draws} draws/frame, spans: ${Object.keys(r.spans).join(", ") || "none"}`;
  } catch (e) {
    myaku.push(e.message);
  } finally {
    await server.close();
  }

  failed ||= keiko.length > 0 || myaku.length > 0;
  const mark = (list) => (list.length ? "✘" : "✔");
  console.log(`${name.padEnd(17)} keiko ${mark(keiko)} (${report.passed}/${report.results.length})  myaku ${mark(myaku)}  ${detail}`);
  for (const m of [...keiko.map((m) => `keiko: ${m}`), ...myaku.map((m) => `myaku: ${m}`)]) console.log(`                  ${m}`);
}
process.exit(failed ? 1 : 0);
