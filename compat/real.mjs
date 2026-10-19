// keiko against the real open-source games in its README's "Real games" table: `node compat/real.mjs`.
// Opt-in and local, never in CI. Each repo is cloned at a pinned commit into compat/.real/ (gitignored),
// gets the small __KEIKO__ hook in compat/real/<game>/hook.patch, and is played by the tests next to it.
// Run `npm run compat` once first, so keiko is built and installed in compat/node_modules.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runTests } from "keiko/runner";

const here = fileURLToPath(new URL(".", import.meta.url));
const cache = `${here}.real/`;

const repos = {
  "phaser-by-example": { url: "https://github.com/phaserjs/phaser-by-example", commit: "df1a56d8c7940d8f8642da3b12ad44c58a7863ce" },
  "open-games": { url: "https://github.com/pixijs/open-games", commit: "83b46762a5572430a94c01091353d0fa3d9909a4" },
};
// `assets` builds the PixiJS games' public/assets with AssetPack, as their own `npm start` does.
const games = {
  runner: { repo: "phaser-by-example", dir: "runner" },
  starshake: { repo: "phaser-by-example", dir: "starshake" },
  "puzzling-potions": { repo: "open-games", dir: "puzzling-potions", assets: true },
  "bubbo-bubbo": { repo: "open-games", dir: "bubbo-bubbo", assets: true },
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
  mkdirSync(`${root}/tests`, { recursive: true });
  for (const f of readdirSync(`${here}real/${name}`)) if (f.endsWith(".test.js")) cpSync(`${here}real/${name}/${f}`, `${root}/tests/${f}`);
}

let failed = false;
for (const name of names) {
  const { repo, dir } = games[name];
  const report = await runTests({ root: `${cache}${repo}/${dir}` });
  const bad = report.results.filter((t) => t.status === "fail");
  failed ||= bad.length > 0 || report.outside.length > 0;
  console.log(`${name.padEnd(17)} ${bad.length || report.outside.length ? "✘" : "✔"} ${report.passed}/${report.results.length}`);
  for (const t of bad) console.log(`                  ${t.name}: ${t.error?.message.split("\n")[0]}`);
  for (const o of report.outside) console.log(`                  outside a test: ${o.message.split("\n")[0]}`);
}
process.exit(failed ? 1 : 0);
