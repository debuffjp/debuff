import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { changedSpans, touchesUsed } from "../src/impact.js";
import { runTests } from "../src/runner.js";

describe("changedSpans and touchesUsed", () => {
  const before = "function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}\nb();";
  const idle: [number, number][] = [[14, 28]]; // a's body, which never ran, up to and including its "}"

  it("lets edits and insertions inside code that never ran through, and nothing else", () => {
    const inA = changedSpans(before, before.replace("return 1", "return 10"));
    const added = changedSpans(before, before.replace("  return 1;\n", "  log();\n  return 1;\n"));
    const inB = changedSpans(before, before.replace("return 2", "return 20"));
    const appended = changedSpans(before, `${before}\nb();`);
    expect(touchesUsed(inA, idle, before)).toBe(false);
    expect(touchesUsed(added, idle, before)).toBe(false);
    expect(touchesUsed(inB, idle, before)).toBe(true);
    expect(touchesUsed(appended, idle, before)).toBe(true);
    expect(changedSpans(before, before)).toEqual([]);
  });
});

describe("runTests with changed", { timeout: 120_000 }, () => {
  const tmp = mkdtempSync(join(fileURLToPath(new URL(".", import.meta.url)), ".changed-"));
  cpSync(fileURLToPath(new URL("./fixture-changed", import.meta.url)), tmp, { recursive: true });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const edit = (file: string, from: string, to: string) => {
    const path = join(tmp, file);
    writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
  };
  const ran = async () => {
    const report = await runTests({ root: tmp, changed: true });
    expect(report.ok).toBe(true);
    return { names: report.results.map((r) => r.name), unchanged: report.unchanged, due: Object.values(report.due ?? {}) };
  };

  it("runs only the tests that ran the code or read the file that changed", async () => {
    expect(await ran()).toEqual({ names: ["shoots", "walks"], unchanged: 0, due: ["new", "new"] });
    expect(await ran()).toEqual({ names: [], unchanged: 2, due: [] });
    edit("src/main.js", "shots += 1", "shots += 2");
    expect(await ran()).toEqual({ names: ["shoots"], unchanged: 1, due: ["code"] });
    edit("src/main.js", "let level;", "let level;\nconst unused = () => 0;");
    expect((await ran()).names).toEqual(["shoots", "walks"]);
    edit("level.json", "one", "two");
    expect(await ran()).toEqual({ names: ["shoots", "walks"], unchanged: 0, due: ["input", "input"] });
    // Another queue has its own last run: everything is new to it.
    expect((await runTests({ root: tmp, changed: true, queue: "push" })).results).toHaveLength(2);
  });
});

// Changes an audit found --changed missing (green while a full run failed). Each game reports `v`; the edit
// changes what a test sees, so the test must run again.
const game = (pre: string, value: string) =>
  `${pre}\nlet t = 0;\nfunction frame() {\n  t += 1;\n  requestAnimationFrame(frame);\n}\nrequestAnimationFrame(frame);\nwindow.__KEIKO__ = { state: () => ({ v: ${value} }), scene: () => "play" };\n`;
const plays = `import { expect, play, test } from "keiko";
test("t", async () => {
  const game = await play();
  game.hold("KeyA", 5);
  await game.settle();
  game.hold("KeyA", 1);
  expect(game.state.v).toBeDefined();
});
`;
type Files = Record<string, string>;
interface Case {
  name: string;
  files: Files;
  edit: Files;
}
const cases: Case[] = [
  {
    name: "a file another plugin's middleware serves (debuff's /assets/)",
    files: {
      "vite.config.js": `import { readFileSync } from "node:fs";
export default { plugins: [{ name: "assets", configureServer(s) {
  s.middlewares.use((req, res, next) => {
    if (!req.url.startsWith("/assets/")) return next();
    res.setHeader("content-type", "application/json");
    res.end(readFileSync(new URL("." + req.url, import.meta.url)));
  });
} }] };
`,
      "assets/level.json": '{"n":1}',
      "src/main.js": game('let n = 0;\nfetch("/assets/level.json").then((r) => r.json()).then((d) => { n = d.n; });', "n"),
    },
    edit: { "assets/level.json": '{"n":2}' },
  },
  {
    name: "a static method of a class with an instance field, never constructed",
    files: { "src/main.js": game("class Physics {\n  speed = 3;\n  static gravity() {\n    return 10;\n  }\n}", "Physics.gravity()") },
    edit: { "src/main.js": game("class Physics {\n  speed = 3;\n  static gravity() {\n    return -10;\n  }\n}", "Physics.gravity()") },
  },
  {
    name: "a ?raw import (no source map, so no coverage)",
    files: { "src/msg.txt": "hi", "src/main.js": game('import msg from "./msg.txt?raw";', "msg") },
    edit: { "src/msg.txt": "yo" },
  },
  {
    name: "an ?inline CSS import",
    files: { "src/a.css": "body { color: red; }", "src/main.js": game('import css from "./a.css?inline";', "css.length") },
    edit: { "src/a.css": "body { color: blue; }" },
  },
  {
    name: "a new file an import.meta.glob matches",
    files: {
      "src/levels/a.js": "export default 1;\n",
      "src/main.js": game('const levels = import.meta.glob("./levels/*.js", { eager: true });', "Object.keys(levels).length"),
    },
    edit: { "src/levels/b.js": "export default 2;\n" },
  },
  {
    name: "a .env value",
    files: { ".env": "VITE_SPEED=1\n", "src/main.js": game("", "Number(import.meta.env.VITE_SPEED)") },
    edit: { ".env": "VITE_SPEED=2\n" },
  },
  {
    name: "a file the Vite config imports",
    files: {
      "tuning.js": "export const speed = 1;\n",
      "vite.config.js": 'import { speed } from "./tuning.js";\nexport default { define: { __SPEED__: JSON.stringify(speed) } };\n',
      "src/main.js": game("", "__SPEED__"),
    },
    edit: { "tuning.js": "export const speed = 2;\n" },
  },
  {
    name: "code outside the project root (a linked package)",
    files: {
      "../outside-lib/lib.js": "export function speed() {\n  return 1;\n}\n",
      "src/main.js": game('import { speed } from "../../outside-lib/lib.js";', "speed()"),
    },
    edit: { "../outside-lib/lib.js": "export function speed() {\n  return 2;\n}\n" },
  },
  {
    name: "a file a plugin's virtual module reads",
    files: {
      "data.json": '{"n":1}',
      "vite.config.js": `import { readFileSync } from "node:fs";
export default { plugins: [{ name: "data", resolveId: (id) => (id === "virtual:data" ? "\\0virtual:data" : undefined),
  load: (id) => (id === "\\0virtual:data" ? \`export default \${readFileSync(new URL("./data.json", import.meta.url), "utf8")};\` : undefined) }] };
`,
      "src/main.js": game('import data from "virtual:data";', "data.n"),
    },
    edit: { "data.json": '{"n":2}' },
  },
  {
    name: "a file the test reads with node:fs",
    files: {
      "src/main.js": game("", "t"),
      "tests/expected.json": '{"n":1}',
      "tests/t.test.js": `import { readFileSync } from "node:fs";
import { expect, test } from "keiko";
test("t", () => {
  expect(JSON.parse(readFileSync(new URL("./expected.json", import.meta.url), "utf8")).n).toBeDefined();
});
`,
    },
    edit: { "tests/expected.json": '{"n":2}' },
  },
  {
    name: "a function that never ran, edited to close itself and add code that runs at load",
    files: { "src/main.js": game("let v = 1;\nfunction unused() {\n  return 4;\n}", "v") },
    edit: { "src/main.js": game("let v = 1;\nfunction unused() {\n  return 5; } v = 2; function zz() {\n}", "v") },
  },
  {
    name: "a tsconfig it extends, with paths and globs that look like comments",
    files: {
      "src/main.js": game("", "t"),
      "tsconfig.base.json": '{ "compilerOptions": { "strict": true } }\n',
      "tsconfig.json":
        '{\n  "extends": "./tsconfig.base.json",\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] } },\n  "include": ["src/**/*"]\n}\n',
    },
    edit: { "tsconfig.base.json": '{ "compilerOptions": { "strict": false } }\n' },
  },
];

describe("runTests with changed: what counts as a change", { timeout: 180_000 }, () => {
  const tmp = mkdtempSync(join(fileURLToPath(new URL(".", import.meta.url)), ".changed-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  let n = 0;
  const fixture = (files: Files) => {
    const root = join(tmp, `case-${++n}`, "game");
    const all: Files = {
      "package.json": '{ "private": true, "type": "module" }',
      "index.html": '<!doctype html><html><body><script type="module" src="/src/main.js"></script></body></html>',
      "tests/t.test.js": plays,
      ...files,
    };
    for (const [path, text] of Object.entries(all)) {
      if (text === "") continue; // "" leaves out a default file
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return root;
  };
  const run = async (root: string) => {
    const report = await runTests({ root, changed: true });
    expect(report.outside).toEqual([]);
    expect(report.results.filter((r) => r.status === "fail").map((r) => r.error?.message)).toEqual([]);
    return report.results.map((r) => r.name);
  };

  it.each(cases)("runs the test again after a change to $name", async ({ files, edit }) => {
    const root = fixture(files);
    expect(await run(root)).toEqual(["t"]);
    expect(await run(root)).toEqual([]);
    for (const [path, text] of Object.entries(edit)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    expect(await run(root)).toEqual(["t"]);
  });

  it("carries test state across tests: a helper an earlier test changes, or one it loads and a later test calls", async () => {
    const root = fixture({
      "src/main.js": game("", "t"),
      "tests/counter.js": "let n = 0;\nexport function bump() {\n  n += 1;\n}\nexport function count() {\n  return n;\n}\n",
      "tests/helper.js": "export function g() {\n  return 1;\n}\n",
      "tests/t.test.js": `import { expect, play, test } from "keiko";
import { bump, count } from "./counter.js";
let helper;
test("first", async () => {
  bump();
  helper = await import("./helper.js");
});
test("second", async () => {
  const game = await play();
  game.hold("KeyA", 2);
  expect(count()).toBe(1);
  expect(helper.g()).toBe(1);
});
`,
    });
    expect(await run(root)).toEqual(["first", "second"]);
    // "second" calls a function of a module "first" loaded: an edit to it is an edit to what "second" ran,
    // so it runs and fails, as it does in a full run.
    writeFileSync(join(root, "tests/helper.js"), "export function g() {\n  return 2;\n}\n");
    const broken = await runTests({ root, changed: true });
    expect(broken.results.map((r) => `${r.name}:${r.status}`)).toEqual(["first:pass", "second:fail"]);
    writeFileSync(join(root, "tests/helper.js"), "export function g() {\n  return 1;\n}\n");
    expect(await run(root)).toEqual(["first", "second"]);
    // An edit to "second" alone still runs "first", whose bump() "second" counts on.
    writeFileSync(join(root, "tests/t.test.js"), readFileSync(join(root, "tests/t.test.js"), "utf8").replace('"KeyA", 2', '"KeyA", 3'));
    expect(await run(root)).toEqual(["first", "second"]);
  });

  it("runs a test whose module no longer loads, even when the broken code never ran", async () => {
    const root = fixture({ "src/main.js": game("function unused() {\n  const q = 1;\n  return q;\n}", "t") });
    expect(await run(root)).toEqual(["t"]);
    writeFileSync(join(root, "src/main.js"), game("function unused() {\n  let q = 1;\n  let q = 2;\n  return q;\n}", "t"));
    const report = await runTests({ root, changed: true });
    expect(report.results.map((r) => `${r.name}:${r.status}`)).toEqual(["t:fail"]);
  });

  it("keeps a setup change due for tests a filtered run left out", async () => {
    const root = fixture({
      "vite.config.js": "export default { define: { __N__: 1 } };\n",
      "src/main.js": game("", "__N__"),
      "tests/a.test.js": plays.replace('test("t"', 'test("a"'),
      "tests/b.test.js": plays.replace('test("t"', 'test("b"'),
      "tests/t.test.js": "",
    });
    expect(await run(root)).toEqual(["a", "b"]);
    writeFileSync(join(root, "vite.config.js"), "export default { define: { __N__: 2 } };\n");
    await runTests({ root, changed: true, filter: "a" });
    expect(await run(root)).toEqual(["b"]);
  });

  it("doesn't rerun a file for a todo test in it", async () => {
    const root = fixture({ "tests/t.test.js": `${plays}test.todo("later");\n`, "src/main.js": game("", "t") });
    await run(root);
    const report = await runTests({ root, changed: true });
    expect(report.results.map((r) => `${r.name}:${r.status}`)).toEqual(["later:todo"]);
  });

  it("leaves a test alone when a file it requested is still missing", async () => {
    const root = fixture({
      "vite.config.js":
        'export default { plugins: [{ name: "404", configureServer(s) { s.middlewares.use((req, res, next) => { if (!req.url.startsWith("/assets/")) return next(); res.statusCode = 404; res.end(); }); } }] };\n',
      "src/main.js": game('let s = 0;\nfetch("/assets/nope.json").then((r) => { s = r.status; });', "s"),
    });
    expect(await run(root)).toEqual(["t"]);
    expect(await run(root)).toEqual([]);
  });
});
