// How popular JavaScript CLIs fail, measured the same way for each: node bench/cli-failures/run.mjs
// Installs the current release of each tool into a temporary folder (the versions are recorded in the
// results), runs four checks against small fixture projects, and writes results/<date>-<platform>.json.
// Needs Node 22+ and network access (npm install).
//
//   unknownOption  an option the tool doesn't have (--frobnicate), added to a command that otherwise succeeds:
//                  rejected (non-zero exit) or ignored (exit 0)?
//   usageVsFailure that usage error's exit code compared with a real failure's (a lint error, a type
//                  error, a failing test): distinct or the same?
//   jsonFailure    with the tool's JSON output on and a real failure: is stdout one parseable document?
//   jsonCantRun    with JSON on and a config file that doesn't exist (debuff: a --root folder that doesn't;
//                  npm: a package lookup): is stdout still JSON, with an error code?
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const win = process.platform === "win32";
const env = { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0", DEBUFF_TELEMETRY: "0", DEBUFF_UPDATE_CHECK: "0" };
const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", shell: win, env, timeout: 180_000 });

// The tools measured, at their current release. debuff appears twice: before (0.19) and after (0.20) its
// failure contract.
const TOOLS_ON_NPM = [
  "typescript",
  "eslint",
  "prettier",
  "vitest",
  "jest",
  "@biomejs/biome",
  "oxlint",
  "vite",
  "rollup",
  "esbuild",
  "webpack",
  "webpack-cli",
];
const deps = {};
for (const name of TOOLS_ON_NPM) deps[name] = sh("npm", ["view", name, "version"]).stdout.trim();
deps["@debuffjp/cli"] = "0.20.0";
deps["debuff-019"] = "npm:@debuffjp/cli@0.19.0";

const dir = mkdtempSync(join(tmpdir(), "cli-failures-"));
const file = (path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
file(
  "package.json",
  JSON.stringify({ name: "cli-failures", private: true, type: "module", scripts: { hello: "node -e 0" }, devDependencies: deps }, null, 2),
);
// Each tool gets an input that passes and one that fails for a real reason.
file("good.ts", "export const n: number = 1;\n");
file("bad.ts", "export const n: number = 'not a number';\n");
file("good.js", "export const used = 1;\n");
file("bad.js", "const unused = 1;\nexport {};\n");
file("pretty.js", "const x = { a: 1 };\n");
file("ugly.js", "const   x={a:1}\n");
file("syntax.js", "export const = ;\n");
file("eslint.config.js", "export default [{ rules: { 'no-unused-vars': 'error' } }];\n");
file("pass.test.js", "import { test, expect } from 'vitest';\ntest('passes', () => expect(1).toBe(1));\n");
file("fail.test.js", "import { test, expect } from 'vitest';\ntest('fails', () => expect(1).toBe(2));\n");
file("jest/pass.test.cjs", "test('passes', () => expect(1).toBe(1));\n");
file("jest/fail.test.cjs", "test('fails', () => expect(1).toBe(2));\n");
file("oxlintrc.json", JSON.stringify({ rules: { "no-unused-vars": "error" } }));
file("biome.json", JSON.stringify({ linter: { rules: { correctness: { noUnusedVariables: "error" } } } }));
file("vite-good/index.html", '<script type="module" src="./main.js"></script>\n');
file("vite-good/main.js", "console.log(1);\n");
file("vite-bad/index.html", '<script type="module" src="./main.js"></script>\n');
file("vite-bad/main.js", "export const = ;\n");
file("game/package.json", JSON.stringify({ name: "game", private: true }));

console.log(`installing into ${dir}`);
const install = sh("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], dir);
if (install.status !== 0) throw new Error(`npm install failed:\n${install.stderr}`);

const bin = (name) => join(dir, "node_modules", ".bin", win ? `${name}.cmd` : name);
const debuff = (pkg) => [process.execPath, join(dir, "node_modules", ...pkg.split("/"), "bin", "debuff.js")];
const run = (cmd) => {
  const [exe, ...args] = cmd;
  const r = spawnSync(exe, args, { cwd: dir, encoding: "utf8", shell: win && exe !== process.execPath, env, timeout: 180_000 });
  return { exit: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};
const parse = (text) => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};
/** An error code near the top of the document: { code }, { error: { code } } or { errors: [{ code }] }. */
const hasCode = (v) =>
  Boolean(
    v &&
      typeof v === "object" &&
      (typeof v.code === "string" ||
        typeof v.error?.code === "string" ||
        (Array.isArray(v.errors) && typeof v.errors[0]?.code === "string")),
  );

// ok: a command that succeeds; the unknown option is added to it. failure: a real failure. json / cantRun:
// the tool's JSON mode on that failure and with a missing config file (absent = the tool has no JSON mode).
const TOOLS = {
  tsc: { ok: [bin("tsc"), "--noEmit", "good.ts"], failure: [bin("tsc"), "--noEmit", "bad.ts"] },
  eslint: {
    ok: [bin("eslint"), "good.js"],
    failure: [bin("eslint"), "bad.js"],
    json: [bin("eslint"), "--format", "json", "bad.js"],
    cantRun: [bin("eslint"), "--format", "json", "--config", "missing.config.js", "bad.js"],
  },
  prettier: { ok: [bin("prettier"), "--check", "pretty.js"], failure: [bin("prettier"), "--check", "ugly.js"] },
  vitest: {
    ok: [bin("vitest"), "run", "pass.test.js"],
    failure: [bin("vitest"), "run", "fail.test.js"],
    json: [bin("vitest"), "run", "--reporter=json", "fail.test.js"],
    cantRun: [bin("vitest"), "run", "--reporter=json", "--config", "missing.config.js", "fail.test.js"],
  },
  jest: {
    ok: [bin("jest"), "--rootDir", "jest", "pass"],
    failure: [bin("jest"), "--rootDir", "jest", "fail"],
    json: [bin("jest"), "--rootDir", "jest", "--json", "fail"],
    cantRun: [bin("jest"), "--json", "--config", "missing.json"],
  },
  biome: {
    ok: [bin("biome"), "lint", "good.js"],
    failure: [bin("biome"), "lint", "bad.js"],
    json: [bin("biome"), "lint", "--reporter=json", "bad.js"],
    cantRun: [bin("biome"), "lint", "--reporter=json", "--config-path=missing", "bad.js"],
  },
  oxlint: {
    ok: [bin("oxlint"), "-c", "oxlintrc.json", "good.js"],
    failure: [bin("oxlint"), "-c", "oxlintrc.json", "bad.js"],
    json: [bin("oxlint"), "-c", "oxlintrc.json", "--format", "json", "bad.js"],
    cantRun: [bin("oxlint"), "-c", "missing.json", "--format", "json", "bad.js"],
  },
  vite: { ok: [bin("vite"), "build", "vite-good"], failure: [bin("vite"), "build", "vite-bad"] },
  rollup: { ok: [bin("rollup"), "good.js"], failure: [bin("rollup"), "syntax.js"] },
  esbuild: { ok: [bin("esbuild"), "good.js"], failure: [bin("esbuild"), "syntax.js"] },
  webpack: {
    ok: [bin("webpack"), "--mode", "none", "--entry", "./good.js", "-o", "out-ok"],
    failure: [bin("webpack"), "--mode", "none", "--entry", "./syntax.js", "-o", "out-bad"],
    json: [bin("webpack"), "--mode", "none", "--json", "--entry", "./syntax.js", "-o", "out-bad"],
    cantRun: [bin("webpack"), "--json", "--config", "missing.config.js"],
  },
  npm: {
    ok: ["npm", "run", "hello"],
    failure: ["npm", "run", "no-such-script"],
    json: ["npm", "run", "no-such-script", "--json"],
    cantRun: ["npm", "view", "no-such-package-cli-failures-bench", "--json"],
  },
  "debuff 0.19": {
    ok: [...debuff("debuff-019"), "inspect", "--root", "game"],
    failure: [...debuff("debuff-019"), "scenario", "--root", "game"],
    json: [...debuff("debuff-019"), "scenario", "--json", "--root", "game"],
    cantRun: [...debuff("debuff-019"), "scenario", "--json", "--root", "missing-019"],
  },
  "debuff 0.20": {
    ok: [...debuff("@debuffjp/cli"), "inspect", "--root", "game"],
    failure: [...debuff("@debuffjp/cli"), "scenario", "--root", "game"],
    json: [...debuff("@debuffjp/cli"), "scenario", "--json", "--root", "game"],
    cantRun: [...debuff("@debuffjp/cli"), "scenario", "--json", "--root", "missing-020"],
  },
};

const OPTION = "--frobnicate";
const results = [];
for (const [tool, t] of Object.entries(TOOLS)) {
  const ok = run(t.ok);
  // Not `--no-…`: many parsers read that as turning an option off.
  const usage = run([...t.ok, OPTION]);
  const failure = run(t.failure);
  const said = `${usage.stderr}\n${usage.stdout}`;
  const warned = /unknown|unrecogni[sz]ed|ignored|not expected|invalid/i.test(said);
  const row = {
    tool,
    okExit: ok.exit,
    usageExit: usage.exit,
    failureExit: failure.exit,
    unknownOption:
      ok.exit !== 0
        ? "n/a (the passing command failed)"
        : usage.exit === 0
          ? warned
            ? "ignored, with a warning"
            : "ignored silently"
          : /\n\s+at .+:\d+:\d+/.test(said)
            ? "rejected, with a stack trace"
            : "rejected",
    usageMessage: (
      said
        .trim()
        .split("\n")
        .find((l) => /frobnicate|unknown|unrecogni|ignored|not expected|invalid/i.test(l)) ?? ""
    )
      .trim()
      .slice(0, 160),
    usageVsFailure: usage.exit === 0 || failure.exit === 0 ? "n/a" : usage.exit === failure.exit ? "same" : "distinct",
  };
  if (t.json) {
    const j = run(t.json);
    const c = run(t.cantRun);
    const cj = parse(c.stdout);
    Object.assign(row, {
      jsonExit: j.exit,
      jsonStdoutStart: j.stdout.trim().slice(0, 80),
      jsonFailure: parse(j.stdout).ok
        ? "json"
        : /JSON report written to/i.test(j.stdout)
          ? "written to a file"
          : j.stdout.trim()
            ? "mixed"
            : "empty",
      cantRunExit: c.exit,
      jsonCantRun: cj.ok ? (hasCode(cj.value) ? "json with code" : "json") : c.stdout.trim() ? "text" : "empty",
      cantRunStdout: c.stdout.trim().slice(0, 200),
      cantRunStderr: c.stderr.trim().slice(0, 200),
    });
  } else Object.assign(row, { jsonFailure: "no JSON mode", jsonCantRun: "no JSON mode" });
  results.push(row);
  console.log([tool, row.unknownOption, row.usageVsFailure, row.jsonFailure, row.jsonCantRun].join(" · "));
}

const versions = { node: process.version, npm: sh("npm", ["--version"]).stdout.trim(), ...deps };
const out = {
  date: new Date().toISOString(),
  platform: `${process.platform} ${process.arch}`,
  versions,
  checks: {
    unknownOption: "an unknown option added to a command that otherwise succeeds: rejected (non-zero exit) or ignored (exit 0)",
    usageVsFailure: "that usage error's exit code compared with a real failure's",
    jsonFailure: "stdout with JSON output on and a real failure: one parseable document, mixed with other text, or empty",
    jsonCantRun: "stdout with JSON output on and a missing config file: JSON (with an error code or not), text, or empty",
  },
  results,
};
mkdirSync(join(here, "results"), { recursive: true });
const name = `${out.date.slice(0, 10)}-${process.platform}.json`;
writeFileSync(join(here, "results", name), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote results/${name}`);
rmSync(dir, { recursive: true, force: true });
