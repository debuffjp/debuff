// agent-cli: one place for the lookups and commands agents repeat in this repo, mined from past sessions.
// Run `bin/agent-cli` for the list. Output is terse, for agents; `--json` gives the same data as JSON.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const json = argv.includes("--json");
const help = argv.includes("--help") || argv.includes("-h");
const args = argv.filter((a) => a !== "--json" && a !== "--help" && a !== "-h");
const [name, ...rest] = args;
const flag = (f) => rest.includes(`--${f}`);
const positional = rest.filter((a) => !a.startsWith("--"));

const win = process.platform === "win32";
/** Run a command, never throwing. npm and npx are .cmd shims on Windows, so they go through the shell as one quoted string. */
function run(cmd, cmdArgs, { cwd = root, input, timeout } = {}) {
  const opts = { cwd, input, timeout, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 };
  const r =
    win && /^np[mx]$/.test(cmd)
      ? spawnSync([cmd, ...cmdArgs.map((a) => (/^[\w./:@=-]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`))].join(" "), {
          ...opts,
          shell: true,
        })
      : spawnSync(cmd, cmdArgs, opts);
  return { ok: r.status === 0, code: r.status ?? 1, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}
const git = (...a) => run("git", a).out;
const lines = (s) => s.split("\n").filter(Boolean);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

function print(data, text) {
  if (json) console.log(JSON.stringify(data, null, 1));
  else console.log(typeof text === "function" ? text(data) : text);
}

/** Workspace packages: name, version, dir. */
function workspaces() {
  return ["packages", "tooling"]
    .flatMap((d) => readdirSync(join(root, d)).map((p) => join(root, d, p, "package.json")))
    .filter(existsSync)
    .map((p) => {
      const j = readJson(p);
      return { name: j.name, version: j.version, dir: relative(root, dirname(p)).replace(/\\/g, "/"), private: !!j.private };
    });
}
/** A package by npm name, short name ("core") or dir. */
function pkg(q) {
  const all = workspaces();
  const hit = all.find((w) => w.name === q || w.dir === q || w.dir.endsWith(`/${q}`) || w.name === `@debuffjp/${q}`);
  if (!hit) fail(`unknown package ${q}; known: ${all.map((w) => w.dir.split("/")[1]).join(" ")}`);
  return hit;
}
function fail(msg) {
  if (json) console.log(JSON.stringify({ error: msg }));
  else console.error(`error: ${msg}`);
  process.exit(1);
}
function siteDir() {
  const dir = [process.env.DEBUFF_SITE, resolve(root, "../docs"), "D:/sitebuild/docs", "D:/docs-live"].find(
    (d) => d && existsSync(join(d, "package.json")) && existsSync(join(d, "ja")),
  );
  if (!dir) fail("debuff.jp source not found: set DEBUFF_SITE");
  return dir;
}
const changedFiles = () =>
  [...new Set([...lines(git("diff", "--name-only", "HEAD")), ...lines(git("ls-files", "--others", "--exclude-standard"))])].filter((f) =>
    existsSync(join(root, f)),
  );

const COMMANDS = {
  status: {
    help: "branch, ahead/behind origin/main, dirty files, unreleased changesets, last commits. --fetch to fetch first",
    run() {
      if (flag("fetch")) git("fetch", "-q", "origin");
      const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
      const data = {
        branch: git("branch", "--show-current"),
        ahead,
        behind,
        dirty: lines(git("status", "--short")),
        changesets: readdirSync(join(root, ".changeset")).filter((f) => f.endsWith(".md") && f !== "README.md"),
        commits: lines(git("log", "--oneline", "-5")),
      };
      print(
        data,
        (d) =>
          `${d.branch} +${d.ahead} -${d.behind} vs origin/main\ndirty: ${d.dirty.length ? `\n  ${d.dirty.join("\n  ")}` : "none"}\nchangesets: ${d.changesets.join(" ") || "none"}\n${d.commits.join("\n")}`,
      );
    },
  },
  versions: {
    help: "workspace versions vs npm. --npm also asks the registry (slower); --mcp adds the MCP Registry's latest",
    async run() {
      const pubs = workspaces().filter((w) => !w.private);
      const latest = async (n) => {
        try {
          return (await (await fetch(`https://registry.npmjs.org/${n.replace("/", "%2f")}/latest`)).json()).version ?? null;
        } catch {
          return null;
        }
      };
      const data = await Promise.all(pubs.map(async (w) => ({ ...w, npm: flag("npm") ? await latest(w.name) : undefined })));
      let mcp;
      if (flag("mcp")) {
        const r = run("curl", ["-s", "https://registry.modelcontextprotocol.io/v0/servers?search=jp.debuff/debuff&version=latest"]);
        try {
          mcp = JSON.parse(r.out).servers?.map((s) => s.server.version)[0] ?? null;
        } catch {
          mcp = null;
        }
      }
      print({ packages: data, mcpRegistry: mcp }, () =>
        [
          ...data.map((w) => `${w.name} ${w.version}${w.npm === undefined ? "" : w.npm === w.version ? " =npm" : ` npm:${w.npm}`}`),
          ...(mcp === undefined ? [] : [`mcp registry ${mcp}`]),
        ].join("\n"),
      );
    },
  },
  check: {
    help: "npm run check, then only what failed (format, lint errors, TS errors, failing tests and workspaces). Full log path printed",
    run() {
      const log = join(tmpdir(), "agent-cli-check.log");
      const t = Date.now();
      const r = run("npm", ["run", "check"], { timeout: 30 * 60_000 });
      const text = `${r.out}\n${r.err}`;
      writeFileSync(log, text);
      const failures = [
        ...new Set(
          lines(text).filter((l) =>
            /^\S.* format ━/.test(l) ||
            (/^\S.*lint\/\S+.*━/.test(l) && !/noNonNullAssertion|useMathMinMax|useDateNow/.test(l) && /×/.test(l))
              ? true
              : /error TS\d+|^\s*FAIL\s|Errors\s+\d+ error|Unhandled Error|^Caused by:|Worker exited|^\s*× .*(?<!Some errors were emitted while running checks\.)$|^✖ |^\s*✗|prose: |npm error code|exit 2: /.test(
                  l,
                ),
          ),
        ),
      ]
        .map((l) => l.trim())
        .slice(0, 40);
      print({ ok: r.ok, seconds: Math.round((Date.now() - t) / 1000), failures, log }, (d) =>
        d.ok
          ? `check ok (${d.seconds}s)`
          : `check FAILED (${d.seconds}s), log ${d.log}\n${d.failures.join("\n") || "(no failure lines matched: read the log)"}`,
      );
      if (!r.ok) process.exitCode = 1;
    },
  },
  fmt: {
    help: "biome check --write on the files you changed (or the files given). What the pre-commit hook does",
    run() {
      const files = positional.length ? positional : changedFiles();
      if (!files.length) return print({ files }, "nothing changed");
      const r = run("npx", ["biome", "check", "--write", "--no-errors-on-unmatched", "--files-ignore-unknown=true", ...files]);
      const summary = lines(`${r.out}\n${r.err}`).filter((l) => /^(Checked|Fixed|Found)/.test(l));
      print({ ok: r.ok, files, summary }, (d) => `${d.ok ? "ok" : "FAILED"} ${d.files.length} files\n${d.summary.join("\n")}`);
      if (!r.ok) process.exitCode = 1;
    },
  },
  test: {
    help: "vitest for files, a test-name filter or a package: test <file|package>... [-t name]",
    run() {
      const i = rest.indexOf("-t");
      const filter = i >= 0 ? ["-t", rest[i + 1]] : [];
      const targets = rest
        .filter((p, k) => !p.startsWith("-") && rest[k - 1] !== "-t")
        .map((p) => (existsSync(join(root, p)) ? p : `${pkg(p).dir}/test`));
      const r = run("npx", ["vitest", "run", ...targets, ...filter]);
      const text = `${r.out}\n${r.err}`;
      const failed = lines(text)
        .filter((l) => /^\s*(FAIL|×)\s/.test(l))
        .map((l) => l.trim());
      const tally =
        lines(text)
          .find((l) => /^\s*Tests\s/.test(l))
          ?.trim() ?? "";
      const errs = lines(text)
        .filter((l) => /^(Assertion|Type|Reference|Range)?Error:|expected .* to /.test(l.trim()))
        .slice(0, 10)
        .map((l) => l.trim());
      print({ ok: r.ok, tally, failed, errors: errs }, (d) =>
        [d.ok ? "ok" : "FAILED", d.tally, ...d.failed, ...d.errors].filter(Boolean).join("\n"),
      );
      if (!r.ok) process.exitCode = 1;
    },
  },
  types: {
    help: "tsc --noEmit for one package (or every workspace with no argument): types [package]",
    run() {
      const targets = positional.length
        ? positional.map((p) => pkg(p).dir)
        : workspaces()
            .map((w) => w.dir)
            .filter((d) => existsSync(join(root, d, "tsconfig.json")));
      const errors = targets.flatMap((d) => lines(run("npx", ["tsc", "-p", d, "--noEmit"]).out).filter((l) => /error TS/.test(l)));
      print({ ok: !errors.length, errors }, (d) => (d.ok ? `types ok (${targets.length})` : d.errors.join("\n")));
      if (errors.length) process.exitCode = 1;
    },
  },
  build: {
    help: "npm run build for one package or everything: build [package]",
    run() {
      const r = positional.length ? run("npm", ["run", "build", "-w", pkg(positional[0]).name]) : run("npm", ["run", "build"]);
      const errors = lines(`${r.out}\n${r.err}`)
        .filter((l) => /error/i.test(l) && !/^npm notice/.test(l))
        .slice(0, 20);
      print({ ok: r.ok, errors }, (d) => (d.ok ? "build ok" : `build FAILED\n${d.errors.join("\n")}`));
      if (!r.ok) process.exitCode = 1;
    },
  },
  exports: {
    help: "what a package exports from src/index.ts, optionally filtered: exports <package> [name]",
    run() {
      const p = pkg(positional[0] ?? fail("exports <package> [name]"));
      const src = readFileSync(join(root, p.dir, "src/index.ts"), "utf8");
      const names = [];
      for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)"/g))
        for (const n of m[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean))
          names.push({ name: n.replace(/^type\s+/, ""), type: n.startsWith("type "), from: m[2] });
      for (const m of src.matchAll(/export\s+\*\s+from\s+"([^"]+)"/g)) names.push({ name: "*", type: false, from: m[1] });
      for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|interface|type|enum)\s+(\w+)/g))
        names.push({ name: m[1], type: false, from: "./index.ts" });
      const q = positional[1]?.toLowerCase();
      const hits = q ? names.filter((n) => n.name.toLowerCase().includes(q)) : names;
      print(
        { package: p.name, exports: hits },
        (d) => d.exports.map((e) => `${e.type ? "type " : ""}${e.name}  ${e.from}`).join("\n") || "no match",
      );
    },
  },
  prs: {
    help: "open PRs: number, draft, merge state, checks, title",
    run() {
      const r = run("gh", [
        "pr",
        "list",
        "--state",
        "open",
        "--json",
        "number,title,isDraft,mergeStateStatus,headRefName,statusCheckRollup",
      ]);
      if (!r.ok) fail(r.err);
      const data = JSON.parse(r.out).map((p) => ({
        number: p.number,
        title: p.title,
        draft: p.isDraft,
        merge: p.mergeStateStatus,
        branch: p.headRefName,
        checks: (p.statusCheckRollup ?? []).map((c) => c.conclusion ?? c.status).join(",") || "none",
      }));
      print(
        data,
        (d) => d.map((p) => `#${p.number}${p.draft ? " draft" : ""} ${p.merge} ${p.checks} ${p.title}`).join("\n") || "no open PRs",
      );
    },
  },
  release: {
    help: "the Version packages PR (if open) and the last Release workflow run. --watch waits for the run to finish",
    run() {
      const pr = JSON.parse(
        run("gh", ["pr", "list", "--state", "open", "--search", "Version packages in:title", "--json", "number,mergeStateStatus"]).out ||
          "[]",
      )[0];
      const last = JSON.parse(
        run("gh", ["run", "list", "--workflow", "Release", "-L", "1", "--json", "databaseId,status,conclusion,displayTitle,createdAt"])
          .out || "[]",
      )[0];
      if (flag("watch") && last) run("gh", ["run", "watch", String(last.databaseId), "--exit-status"], { timeout: 30 * 60_000 });
      const run2 = flag("watch")
        ? JSON.parse(run("gh", ["run", "view", String(last.databaseId), "--json", "status,conclusion"]).out)
        : last;
      print({ versionPr: pr ?? null, lastRun: last ? { ...last, ...run2 } : null }, (d) =>
        [
          d.versionPr ? `version PR #${d.versionPr.number} ${d.versionPr.mergeStateStatus}` : "no version PR open",
          d.lastRun
            ? `release run ${d.lastRun.databaseId} ${d.lastRun.status} ${d.lastRun.conclusion ?? ""} "${d.lastRun.displayTitle}"`
            : "no release runs",
        ].join("\n"),
      );
    },
  },
  registry: {
    help: "republish the MCP Registry entry (jp.debuff/debuff) at tooling/mcp's version. Needs .debuff/mcp-registry/key.pem here or in D:/debuff",
    run() {
      const key = join(root, ".debuff/mcp-registry/key.pem");
      const borrowed = !existsSync(key) && existsSync("D:/debuff/.debuff/mcp-registry/key.pem");
      if (borrowed) {
        mkdirSync(dirname(key), { recursive: true });
        copyFileSync("D:/debuff/.debuff/mcp-registry/key.pem", key);
      }
      try {
        const r = run("node", ["tooling/mcp/scripts/publish-registry.mjs"]);
        const out = lines(`${r.out}\n${r.err}`).filter((l) => /✓|error|Error/.test(l));
        print({ ok: r.ok, out }, (d) => `${d.ok ? "published" : "FAILED"}\n${d.out.join("\n")}`);
        if (!r.ok) process.exitCode = 1;
      } finally {
        if (borrowed) rmSync(key);
      }
    },
  },
  papercuts: {
    help: "papercuts.debuff.jp entries not fixed or wontfix; papercuts <id> for one with hits. Admin token from PAPERCUTS_TOKEN or ../papercuts/.tokens",
    async run() {
      const tokenFile = ["D:/papercuts/.tokens", resolve(root, "../papercuts/.tokens")].find(existsSync);
      const token = process.env.PAPERCUTS_TOKEN ?? (tokenFile && /^ADMIN_TOKEN=(.+)$/m.exec(readFileSync(tokenFile, "utf8"))?.[1]?.trim());
      const base = (process.env.DEBUFF_PAPERCUTS_URL ?? "https://papercuts.debuff.jp").replace(/\/+$/, "");
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      if (positional[0]) {
        const d = await (await fetch(`${base}/api/entries/${positional[0]}`, { headers })).json();
        return print(d, (x) =>
          [
            `#${x.entry.id} [${x.entry.status}] ${x.entry.repo}/${x.entry.area} ${x.entry.title}`,
            x.entry.body,
            x.entry.workaround && `workaround: ${x.entry.workaround}`,
            ...x.hits.map((h) => `hit ${h.at.slice(0, 10)} ${h.reporter ?? ""} ${h.minutes}m ${h.note ?? ""}`),
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
      const body = await (await fetch(`${base}/api/entries?status=all`, { headers })).json();
      const all = (body.entries ?? body)
        .filter((e) => flag("all") || !["fixed", "wontfix", "merged"].includes(e.status))
        .sort((a, b) => a.id - b.id);
      print(all, (d) => d.map((e) => `#${e.id} [${e.status}] ${e.repo}/${e.area || "-"} ${e.title}`).join("\n") || "none open");
    },
  },
  site: {
    help: "debuff.jp source (DEBUFF_SITE, ../docs or D:/docs-live): site lint | site deploy | site live <path> [text]",
    async run() {
      const [sub, path, text] = positional;
      const dir = siteDir();
      if (sub === "lint") {
        const en = run("npm", ["run", "lint:en"], { cwd: dir });
        const ja = run("npm", ["run", "check:ja"], { cwd: dir });
        const jaText = run("npx", ["textlint", ...lines(run("git", ["diff", "--name-only", "HEAD", "--", "ja"], { cwd: dir }).out)], {
          cwd: dir,
        });
        const problems = lines(`${en.out}\n${jaText.out}`).filter((l) => /^\s+\d+:\d+\s+(✓ )?error/.test(l) || /^\S+\.md$/.test(l));
        const jaLine = lines(ja.out).find((l) => /check:ja \d+/.test(l)) ?? "";
        return print(
          { ok: en.ok && ja.ok && jaText.ok, dir, problems, ja: jaLine },
          (d) => `${d.ok ? "site lint ok" : "site lint FAILED"} (${d.dir})\n${d.ja}\n${d.problems.join("\n")}`,
        );
      }
      if (sub === "deploy") {
        const r = run("npm", ["run", "deploy"], { cwd: dir, timeout: 30 * 60_000 });
        const log = join(tmpdir(), "agent-cli-deploy.log");
        writeFileSync(log, `${r.out}\n${r.err}`);
        const keep = lines(`${r.out}\n${r.err}`).filter((l) =>
          /Current Version ID|IndexNow|error TS|\[error\]|✖|\s\d+:\d+\s+error/.test(l),
        );
        print({ ok: r.ok, dir, out: keep, log }, (d) => `${d.ok ? "deployed" : `deploy FAILED, log ${d.log}`}\n${d.out.join("\n")}`);
        if (!r.ok) process.exitCode = 1;
        return;
      }
      if (sub === "live") {
        const url = `https://debuff.jp/${(path ?? "").replace(/^\/+/, "").replace(/\.md$/, "")}.md`;
        const res = await fetch(url);
        const body = await res.text();
        const count = text ? body.split(text).length - 1 : undefined;
        return print(
          { url, status: res.status, bytes: body.length, matches: count },
          (d) => `${d.status} ${d.url} ${d.bytes}b${d.matches === undefined ? "" : ` "${text}" x${d.matches}`}`,
        );
      }
      fail("site lint | site deploy | site live <path> [text]");
    },
  },
  docs: {
    help: "where a name is documented: repo Markdown/JSDoc and debuff.jp source (write-docs step 1): docs <term>",
    run() {
      const term = positional[0] ?? fail("docs <term>");
      const repo = lines(git("grep", "-n", "-F", term, "--", "*.md", "packages/*/src/*.ts", "tooling/*/src/*.ts", ":!**/CHANGELOG.md")).map(
        (l) => l.slice(0, 160),
      );
      let site = [];
      try {
        const dir = siteDir();
        site = lines(run("git", ["grep", "-n", "-F", term, "--", "*.md"], { cwd: dir }).out).map((l) => `site:${l.slice(0, 160)}`);
      } catch {}
      print({ repo, site }, (d) => [...d.repo, ...d.site].join("\n") || "not found");
    },
  },
  changelog: {
    help: "the newest CHANGELOG entry of a package: changelog <package> [count]",
    run() {
      const p = pkg(positional[0] ?? fail("changelog <package>"));
      const text = readFileSync(join(root, p.dir, "CHANGELOG.md"), "utf8");
      const entries = text
        .split(/^## /m)
        .slice(1, 1 + Number(positional[1] ?? 1))
        .map((e) => `## ${e.trim()}`);
      print({ package: p.name, entries }, (d) => d.entries.join("\n\n"));
    },
  },
  decisions: {
    help: "titles in docs/decisions.md and docs/adr/, filtered by a term: decisions [term]",
    run() {
      const q = positional[0]?.toLowerCase();
      const dec = lines(readFileSync(join(root, "docs/decisions.md"), "utf8"))
        .filter((l) => l.startsWith("## "))
        .map((l) => `decisions: ${l.slice(3)}`);
      const adr = readdirSync(join(root, "docs/adr"))
        .filter((f) => f.endsWith(".md"))
        .map((f) => `adr/${f}: ${(readFileSync(join(root, "docs/adr", f), "utf8").match(/^# (.+)$/m) ?? [])[1] ?? ""}`);
      const hits = [...dec, ...adr].filter((l) => !q || l.toLowerCase().includes(q));
      print(hits, (d) => d.join("\n"));
    },
  },
  ports: {
    help: "listening TCP ports 5170-5199 and 8787 with PIDs (dev servers, wrangler); ports kill <port>",
    run() {
      const out = win ? run("netstat", ["-ano", "-p", "TCP"]).out : run("sh", ["-c", "ss -ltnp 2>/dev/null || netstat -ltnp"]).out;
      const seen = new Map();
      for (const l of lines(out)) {
        const m = /[:.](\d{4,5})\s.*LISTEN\S*\s+(?:.*pid=)?(\d+)/i.exec(l);
        if (m && ((+m[1] >= 5170 && +m[1] <= 5199) || m[1] === "8787")) seen.set(m[1], m[2]);
      }
      const data = [...seen].map(([port, pid]) => ({ port: +port, pid: +pid }));
      if (positional[0] === "kill") {
        const target = data.find((d) => d.port === Number(positional[1])) ?? fail(`nothing listening on ${positional[1]}`);
        const r = win ? run("taskkill", ["/PID", String(target.pid), "/F", "/T"]) : run("kill", [String(target.pid)]);
        return print({ killed: target, ok: r.ok }, (d) => `${d.ok ? "killed" : "kill FAILED"} ${d.killed.port} pid ${d.killed.pid}`);
      }
      print(data, (d) => d.map((p) => `${p.port} pid ${p.pid}`).join("\n") || "none");
    },
  },
};

if (!name || name === "help" || (help && !name)) {
  const list = Object.entries(COMMANDS).map(([n, c]) => ({ name: n, help: c.help }));
  print(list, (d) => `agent-cli <command> [--json] [--help]\n${d.map((c) => `  ${c.name.padEnd(10)} ${c.help}`).join("\n")}`);
} else if (!COMMANDS[name]) fail(`unknown command ${name}; run bin/agent-cli for the list`);
else if (help) print({ name, help: COMMANDS[name].help }, `${name}: ${COMMANDS[name].help}`);
else await COMMANDS[name].run();
