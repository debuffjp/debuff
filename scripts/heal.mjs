// Stage 2 of the self-healing bet (debuffjp/lab bets/self-healing): turn automatic `dev:bug:` papercuts into
// fix branches. For each papercut, an agent works in a fresh worktree from nothing but the signature (error name
// and up to three debuff functions). The script then checks the result itself instead of trusting the agent:
// a new test must fail without the fix and pass with it, and `npm run check` must pass.
//
// Usage: node scripts/heal.mjs                       open and pending automatic bug papercuts (PAPERCUTS_TOKEN)
//        node scripts/heal.mjs --signature "<sig>" --id <n>   one signature, no board needed
//        --base <ref>   start from this ref instead of origin/main
//        --push         push the branch and open a draft PR (otherwise the branch stays local)
//        --verify       skip the agent: check and commit what is already in .heal/papercut-<id>, for a fix
//                       made some other way (a subagent of an interactive session, say)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = resolve(import.meta.dirname, "..");
const base = option("base") ?? "origin/main";
// npm and npx are .cmd shims on Windows and need a shell; claude and git don't, which keeps the prompt unquoted.
const sh = (cmd, cmdArgs, cwd = root, opts = {}) =>
  spawnSync(cmd, cmdArgs, { cwd, encoding: "utf8", shell: process.platform === "win32" && /^np[mx]$/.test(cmd), ...opts });
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

async function papercuts() {
  const signature = option("signature");
  if (signature) return [{ id: Number(option("id") ?? 0), title: signature, fingerprint: `dev:bug:${signature}` }];
  const token = process.env.PAPERCUTS_TOKEN;
  if (!token) throw new Error("Set PAPERCUTS_TOKEN (the board's admin token), or pass --signature.");
  const url = (process.env.DEBUFF_PAPERCUTS_URL ?? "https://papercuts.debuff.jp").replace(/\/+$/, "");
  const res = await fetch(`${url}/api/entries?status=all`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`papercuts board: HTTP ${res.status}`);
  const body = await res.json();
  return (body.entries ?? body).filter((e) => e.fingerprint?.startsWith("dev:bug:") && (e.status === "open" || e.status === "pending"));
}

const prompt = (p, signature) => `You are fixing a bug in debuff that a game hit at runtime. debuff reported it automatically as
papercut #${p.id}. All you have is its signature: the error name, then up to three debuff functions it was thrown
from, innermost first, as "<file as installed or served>:<function>":

  ${signature}

The file paths are as a game sees them (for example @debuffjp/juice/dist/particles.js is packages/juice/src/particles.ts,
spryte.js is packages/spryte/src). No message, stack lines or game code are included, on purpose.

1. Find the functions in this repository and work out which inputs or call order make them throw that error.
2. Write a regression test, in the package's existing test/ directory and style, that throws the same error now.
   Run it with \`npx vitest run <file>\` and see it fail.
3. Make the smallest fix in the package source. Run the test again and see it pass.
4. Add a changeset in .changeset/ (patch) that says what broke, in one or two plain sentences.

Rules: read AGENTS.md first. Don't commit, push or touch anything outside this worktree. Don't change existing
tests to make them pass. If you can't reproduce the error from the signature, change nothing and say why in your
last message, starting with "NO REPRO:".`;

function check(cwd, changed) {
  const tests = changed.filter((f) => /\/test\/.*\.test\.ts$/.test(f));
  const sources = changed.filter((f) => /^(packages|tooling)\/[\w-]+\/src\//.test(f));
  if (!tests.length || !sources.length) return `needs a test and a source change, got: ${changed.join(", ") || "nothing"}`;
  // Without the fix the new test must fail, or it doesn't prove anything.
  // (Not git stash: the stash stack is shared with every other worktree.)
  const fixed = sources.map((f) => [f, readFileSync(join(cwd, f), "utf8")]);
  for (const [f] of fixed) {
    if (sh("git", ["cat-file", "-e", `HEAD:${f}`], cwd).status === 0)
      writeFileSync(join(cwd, f), sh("git", ["show", `HEAD:${f}`], cwd).stdout);
    else rmSync(join(cwd, f));
  }
  const before = sh("npx", ["vitest", "run", ...tests], cwd);
  for (const [f, text] of fixed) writeFileSync(join(cwd, f), text);
  if (before.status === 0) return "the test passes without the fix";
  const after = sh("npx", ["vitest", "run", ...tests], cwd);
  if (after.status !== 0) return `the test fails with the fix:\n${after.stdout.slice(-1500)}`;
  // What the pre-commit hook would do anyway: agents don't always write the formatter's line endings and wrapping.
  sh("npx", ["biome", "check", "--write", "--no-errors-on-unmatched", ...changed], cwd);
  const full = sh("npm", ["run", "check"], cwd);
  if (full.status !== 0) return `npm run check fails:\n${full.stdout.slice(-1500)}`;
  return undefined;
}

for (const p of await papercuts()) {
  const signature = p.fingerprint.slice("dev:bug:".length);
  const branch = `heal/papercut-${p.id}`;
  const dir = join(root, ".heal", `papercut-${p.id}`);
  console.log(`\n#${p.id} ${signature}`);
  try {
    if (!flag("verify")) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      sh("git", ["worktree", "prune"]);
      sh("git", ["branch", "-D", branch]);
      git(root, "worktree", "add", "-q", "-b", branch, dir, base);
      if (sh("npm", ["ci", "--no-audit", "--no-fund"], dir).status !== 0) throw new Error("npm ci failed");
      const agent = sh("claude", ["-p", "--permission-mode", "acceptEdits", "--allowedTools", "Bash,Read,Edit,Write,Grep,Glob"], dir, {
        input: prompt(p, signature),
        timeout: 30 * 60_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      const said = agent.stdout.trim();
      console.log(said.split("\n").slice(-12).join("\n"));
      if (said.includes("NO REPRO:")) continue;
    }
    git(dir, "add", "-A");
    const changed = git(dir, "diff", "--cached", "--name-only").split("\n").filter(Boolean);
    git(dir, "reset", "-q");
    const problem = check(dir, changed);
    if (problem) {
      console.log(`rejected: ${problem}`);
      continue;
    }
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", `Fix ${signature.split(" at ")[0]} reported automatically\n\nFixes papercut #${p.id}`);
    console.log(`ok: ${branch} (${changed.length} files)`);
    if (flag("push")) {
      git(dir, "push", "-q", "-u", "origin", branch);
      const body = `Found and fixed by scripts/heal.mjs from the automatic report's signature:\n\n\`${signature}\`\n\nThe new test fails without the fix and passes with it; \`npm run check\` passes. Review before merging.`;
      console.log(
        sh("gh", ["pr", "create", "--draft", "--head", branch, "--title", `heal: papercut #${p.id}`, "--body", body], dir).stdout.trim(),
      );
    }
  } catch (e) {
    console.log(`error: ${e.message}`);
  }
}
