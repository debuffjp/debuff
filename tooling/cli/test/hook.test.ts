import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkAction,
  type HookAction,
  hookFiles,
  hookInstalled,
  hookOutput,
  hookStatus,
  markTested,
  parsePayload,
  runHook,
  sessionStart,
  writeHookFiles,
} from "../src/hook.js";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});
const project = () => (dir = mkdtempSync(join(tmpdir(), "debuff-hook-")));

const rules = (event: "pre" | "post" | "stop", action: HookAction, root = "/nowhere") =>
  checkAction(event, action, root).map((f) => f.rule);
const shell = (command: string, background = false): HookAction => ({ kind: "shell", command, background });
const edit = (file: string, after: string, before?: string): HookAction => ({
  kind: "edit",
  file,
  after,
  ...(before !== undefined && { before }),
});

describe("pre rules", () => {
  it.each([
    ["npm run dev", ["foreground-dev"]],
    ["npx debuff dev --port 5000", ["foreground-dev"]],
    ["cd game && pnpm dev", ["foreground-dev"]],
    ["npx vite", ["foreground-dev"]],
    ["npm run dev &", []],
    ["npx vite build", []],
    ["npm run devtools-check", []],
    ["npm run build", []],
    ["npx debuff scenario --update", ["baselines"]],
    ["npx debuff scenario jump.json", []],
    ["npx debuff build --accept-saves", ["accept-saves"]],
    ["printf '<html>x</html>' > dist/index.html", ["generated"]],
    ['echo x >> ".debuff/dev-server.json"', ["generated"]],
    ["cat a.png | tee scenarios/__baselines__/jump/land.png", ["baselines"]],
    ["npm run build 2>&1 > build.log", []],
    ["npm test > /dev/null", []],
  ])("%s", (command, expected) => {
    expect(rules("pre", shell(command))).toEqual(expected);
  });

  it("resolves absolute and Git Bash paths in redirects against the project", () => {
    const root = process.platform === "win32" ? "D:\\games\\hop" : "/games/hop";
    const bash = process.platform === "win32" ? "/d/games/hop/dist/index.html" : "/games/hop/dist/index.html";
    expect(rules("pre", shell(`printf x > "${bash}"`), root)).toEqual(["generated"]);
  });

  it("lets a dev server run in the background", () => {
    expect(rules("pre", shell("npm run dev", true))).toEqual([]);
  });

  it.each([
    ["scenarios/__baselines__/jump/land.win32.png", ["baselines"]],
    [".debuff/dev-server.json", ["generated"]],
    ["dist/index.html", ["generated"]],
    ["node_modules/@debuffjp/core/dist/game.js", ["generated"]],
    ["packages/x/node_modules/y.js", ["generated"]],
    ["src/main.ts", []],
    ["assets/hero.tt", []],
  ])("editing %s", (file, expected) => {
    expect(rules("pre", edit(file, "x"))).toEqual(expected);
  });

  it("refuses a hand-changed @debuffjp version, but not a new package or other deps", () => {
    const before = '{ "dependencies": { "@debuffjp/core": "^0.22.1", "vite": "^8.0.0" } }';
    expect(rules("pre", edit("package.json", before.replace("0.22.1", "0.23.0"), before))).toEqual(["hand-bump"]);
    expect(rules("pre", edit("package.json", before.replace("8.0.0", "8.1.0"), before))).toEqual([]);
    expect(rules("pre", edit("package.json", before.replace("}", ', "@debuffjp/ui": "^0.22.1" }'), before))).toEqual([]);
  });

  it("reads package.json from disk for a whole-file write", () => {
    const root = project();
    writeFileSync(join(root, "package.json"), '{ "dependencies": { "@debuffjp/core": "^0.22.1" } }');
    expect(rules("pre", edit("package.json", '{ "dependencies": { "@debuffjp/core": "^0.23.0" } }'), root)).toEqual(["hand-bump"]);
  });
});

describe("post rules", () => {
  it("warns about new lines in src/ only, with the file line", () => {
    const root = project();
    mkdirSync(join(root, "src"));
    const after = "const a = 1;\nconst r = Math.random();";
    writeFileSync(join(root, "src/main.ts"), `// header\n${after}\n`);
    const found = checkAction("post", edit("src/main.ts", after, "const a = 1;"), root);
    expect(found.map((f) => [f.rule, f.where])).toEqual([["math-random", "src/main.ts:3"]]);
    expect(rules("post", edit("tests/jump.test.ts", "Math.random()"))).toEqual([]);
    expect(rules("post", edit("src/notes.md", "Math.random()"))).toEqual([]);
  });

  it("ignores lines the edit didn't add, comments, and the ignore pragma", () => {
    expect(rules("post", edit("src/a.ts", "x = Math.random();\ny = 1;", "x = Math.random();"))).toEqual([]);
    expect(rules("post", edit("src/a.ts", "// Math.random() is not seeded"))).toEqual([]);
    expect(rules("post", edit("src/a.ts", "const t = Date.now(); // debuff-hook-ignore wall-clock"))).toEqual([]);
  });

  it.each([
    ["const t = Date.now();", ["wall-clock"]],
    ["const t = performance.now();", ["wall-clock"]],
    ["const d = new Date();", ["wall-clock"]],
    ["const d = new Date(save.at);", []],
    ["setTimeout(() => spawn(), 500);", ["real-timers"]],
    ["requestAnimationFrame(loop);", ["real-timers"]],
    ["const n = game.random.int(1, 6);", []],
  ])("%s", (line, expected) => {
    expect(rules("post", edit("src/a.ts", line))).toEqual(expected);
  });
});

describe("stop rule", () => {
  const stop = (root: string, session = "s1", continued = false) => rules("stop", { kind: "stop", continued, session }, root);
  const post = (root: string, session = "s1") =>
    runHook(
      ["claude", "post"],
      () =>
        JSON.stringify({
          cwd: root,
          session_id: session,
          tool_name: "Edit",
          tool_input: { file_path: join(root, "src/a.ts"), old_string: "a", new_string: "b" },
        }),
      {},
    );

  it("asks for a test run when this session edited src/ since the last one", () => {
    const root = project();
    expect(stop(root)).toEqual([]);
    post(root);
    expect(stop(root)).toEqual(["untested"]);
    expect(stop(root, "s2")).toEqual([]);
    expect(stop(root, "s1", true)).toEqual([]);
    markTested(root);
    utimesSync(join(root, ".debuff/hook-edited"), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    expect(stop(root)).toEqual([]);
  });
});

describe("parsePayload", () => {
  const root = "/game";
  it("normalises Claude Code tools", () => {
    expect(parsePayload("pre", { tool_name: "Write", tool_input: { file_path: "/game/src/a.ts", content: "x" } }, root)).toEqual([
      { kind: "edit", file: "src/a.ts", after: "x" },
    ]);
    expect(
      parsePayload("pre", { tool_name: "Edit", tool_input: { file_path: "/game/src/a.ts", old_string: "a", new_string: "b" } }, root),
    ).toEqual([{ kind: "edit", file: "src/a.ts", before: "a", after: "b" }]);
    expect(
      parsePayload(
        "pre",
        { tool_name: "MultiEdit", tool_input: { file_path: "/game/src/a.ts", edits: [{ old_string: "a", new_string: "b" }] } },
        root,
      ),
    ).toEqual([{ kind: "edit", file: "src/a.ts", before: "a", after: "b" }]);
    expect(parsePayload("pre", { tool_name: "Bash", tool_input: { command: "npm run dev", run_in_background: true } }, root)).toEqual([
      { kind: "shell", command: "npm run dev", background: true },
    ]);
  });

  it("reads Codex shell arrays and apply_patch bodies", () => {
    expect(parsePayload("pre", { tool_name: "shell", tool_input: { command: ["npm", "run", "dev"] } }, root)).toEqual([
      { kind: "shell", command: "npm run dev", background: false },
    ]);
    const patch =
      "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-old\n+const r = Math.random();\n*** Add File: dist/x.js\n+x\n*** End Patch";
    expect(parsePayload("pre", { tool_name: "apply_patch", tool_input: { input: patch } }, root)).toEqual([
      { kind: "edit", file: "src/a.ts", after: "const r = Math.random();" },
      { kind: "edit", file: "dist/x.js", after: "x" },
    ]);
  });

  it("checks the MCP run_scenarios tool when it would update baselines", () => {
    expect(parsePayload("pre", { tool_name: "mcp__debuff__run_scenarios", tool_input: { update: true } }, root)).toEqual([
      { kind: "shell", command: "debuff scenario --update", background: false },
    ]);
    expect(parsePayload("pre", { tool_name: "mcp__debuff__run_scenarios", tool_input: {} }, root)).toEqual([]);
  });
});

describe("hookOutput", () => {
  const ask = { rule: "baselines", verdict: "ask", message: "m", fix: "f" } as const;
  const refuse = { rule: "generated", verdict: "refuse", message: "m", fix: "f" } as const;
  const warn = { rule: "math-random", verdict: "warn", message: "m", fix: "f", where: "src/a.ts:3" } as const;
  const parse = (s: string) => JSON.parse(s);

  it("asks in Claude Code and refuses in Codex, which can't ask", () => {
    expect(parse(hookOutput("claude", "pre", [ask])).hookSpecificOutput.permissionDecision).toBe("ask");
    const codex = parse(hookOutput("codex", "pre", [ask])).hookSpecificOutput;
    expect(codex.permissionDecision).toBe("deny");
    expect(codex.permissionDecisionReason).toMatch(/^Ask the human first\./);
    expect(parse(hookOutput("claude", "pre", [ask, refuse])).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("gives warnings as context after the edit, and a stop block as the reason", () => {
    expect(hookOutput("claude", "pre", [warn])).toBe("");
    expect(parse(hookOutput("codex", "post", [warn])).hookSpecificOutput.additionalContext).toBe(
      "debuff hook (math-random) src/a.ts:3: m. f.",
    );
    expect(parse(hookOutput("claude", "stop", [refuse]))).toEqual({ decision: "block", reason: "debuff hook (generated): m. f." });
    expect(hookOutput("claude", "post", [])).toBe("");
  });
});

describe("runHook", () => {
  it("fails open on bad input and when turned off", () => {
    expect(runHook(["claude", "pre"], () => "not json", {})).toBe("");
    expect(runHook(["claude", "nope"], () => "{}", {})).toBe("");
    const dev = JSON.stringify({ cwd: "/g", tool_name: "Bash", tool_input: { command: "npm run dev" } });
    expect(runHook(["claude", "pre"], () => dev, { DEBUFF_HOOK: "0" })).toBe("");
    expect(runHook(["claude", "pre"], () => dev, {})).toContain("foreground-dev");
  });
});

describe("sessionStart", () => {
  it("passes the upgrade note to the agent as session context, and is quiet when off", async () => {
    const root = project();
    const configFile = join(root, "config.json");
    const fetch = (async () => new Response(JSON.stringify({ version: "99.0.0" }))) as unknown as typeof globalThis.fetch;
    const out = JSON.parse(await sessionStart({}, { configFile, fetch, now: 0 }));
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toMatch(/^debuff 99.0.0 is out/);
    expect(await sessionStart({}, { configFile, fetch, now: 1 })).toBe("");
    expect(await sessionStart({ DEBUFF_HOOK: "0" }, { configFile: join(root, "b.json"), fetch, now: 0 })).toBe("");
  });
});

describe("hook files", () => {
  it("every template ships exactly the files doctor --fix writes", () => {
    const templates = join(import.meta.dirname, "../../../templates");
    for (const t of ["basic", "isometric", "mossfell", "platformer", "pointclick", "sidescroller", "squish", "topdown"])
      for (const [file, content] of Object.entries(hookFiles()))
        expect(readFileSync(join(templates, t, file), "utf8"), `${t}/${file}`).toBe(content);
  });

  it("writes missing files and leaves a settings file with the user's own settings alone", () => {
    const root = project();
    mkdirSync(join(root, ".claude"));
    const mine = JSON.stringify({ permissions: { allow: ["Bash(ls)"] } });
    writeFileSync(join(root, ".claude/settings.json"), mine);
    expect(writeHookFiles(root)).toEqual([".claude/hooks/debuff.mjs", ".codex/hooks.json"]);
    expect(readFileSync(join(root, ".claude/settings.json"), "utf8")).toBe(mine);
    expect(hookInstalled(root)).toBe(true);
    expect(writeHookFiles(root)).toEqual([]);
  });

  it("refreshes 0.23 config that holds only debuff's hooks, which lacked session start", () => {
    const root = project();
    writeHookFiles(root);
    expect(hookStatus(root)).toBe("current");
    const old = (file: string) => {
      const config = JSON.parse(readFileSync(join(root, file), "utf8"));
      delete config.hooks.SessionStart;
      writeFileSync(join(root, file), JSON.stringify(config, null, 2));
    };
    old(".claude/settings.json");
    old(".codex/hooks.json");
    expect(hookStatus(root)).toBe("outdated");
    expect(writeHookFiles(root)).toEqual([".claude/settings.json", ".codex/hooks.json"]);
    expect(hookStatus(root)).toBe("current");

    const merged = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8"));
    delete merged.hooks.SessionStart;
    merged.hooks.Stop[0].hooks.push({ type: "command", command: "my-linter" });
    writeFileSync(join(root, ".claude/settings.json"), JSON.stringify(merged));
    expect(writeHookFiles(root)).toEqual([]);
    expect(hookStatus(root)).toBe("outdated");
  });

  it("the shim runs the installed hook, and does nothing without it", () => {
    const root = project();
    writeHookFiles(root);
    const input = JSON.stringify({ cwd: root, tool_name: "Bash", tool_input: { command: "npm run dev" } });
    const shim = join(root, ".claude/hooks/debuff.mjs");
    const alone = spawnSync(process.execPath, [shim, "claude", "pre"], { cwd: root, input, encoding: "utf8" });
    expect([alone.status, alone.stdout, alone.stderr]).toEqual([0, "", ""]);
    const template = join(import.meta.dirname, "../../../templates/basic");
    const real = spawnSync(process.execPath, [join(template, ".claude/hooks/debuff.mjs"), "claude", "pre"], {
      cwd: template,
      input,
      encoding: "utf8",
    });
    expect(real.status).toBe(0);
    expect(JSON.parse(real.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });
});
