import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "vite";
import { describe, expect, it } from "vitest";
import { checkSaves, compareSaves, findSaves, type SaveInfo } from "../src/index.js";
import { scanSaves } from "../src/saves.js";

const find = (code: string) => findSaves(parseAst(code), "src/main.ts");

describe("finding saves", () => {
  it("reads the key, each field's kind one level down, and a literal version", () => {
    const found = find(`import { Storage as S } from "@debuffjp/core";
      const a = new S("game", { best: 0, name: "", muted: false, tags: [], opts: { volume: 10, deep: { x: 1 } }, at: null, neg: -1 }, { version: 2 });`);
    expect(found.saves).toEqual([
      {
        key: "game",
        file: "src/main.ts",
        version: 2,
        fields: {
          best: "number",
          name: "string",
          muted: "boolean",
          tags: "array",
          opts: "object",
          "opts.volume": "number",
          "opts.deep": "object",
          at: "null",
          neg: "number",
        },
      },
    ]);
  });

  it("ignores Storage from elsewhere and lists calls it can't read", () => {
    expect(find(`import { Storage } from "./mine"; new Storage("x", { a: 1 });`)).toEqual({ saves: [], unchecked: [] });
    const found = find(`import { Storage } from "@debuffjp/core"; const k = "x"; new Storage(k, { a: 1 }); new Storage("y", defaults);`);
    expect(found.saves).toEqual([]);
    expect(found.unchecked.map((u) => u.reason)).toEqual([
      "the key isn't a string literal",
      'the defaults for "y" aren\'t an object literal',
    ]);
  });
});

describe("comparing saves", () => {
  const save = (fields: Record<string, string>, version?: number): SaveInfo => ({
    key: "game",
    file: "src/main.ts",
    fields,
    ...(version === undefined ? {} : { version }),
  });
  const levels = (prev: SaveInfo[], next: SaveInfo[]) => compareSaves(prev, { saves: next, unchecked: [] }).map((i) => i.level);

  it("errors when a save disappears, warns on a kind change, notes added and removed fields", () => {
    expect(levels([save({ best: "number" })], [])).toEqual(["error"]);
    expect(levels([save({ best: "number" })], [save({ best: "object", "best.score": "number" })])).toEqual(["warning"]);
    expect(levels([save({ best: "number", old: "string" })], [save({ best: "number", added: "boolean" })])).toEqual(["note", "note"]);
  });

  it("trusts a version bump to migrate, and only warns when a missing save might just be unreadable", () => {
    expect(levels([save({ best: "number" }, 1)], [save({ best: "object" }, 2)])).toEqual(["note"]);
    const issues = compareSaves([save({ best: "number" })], { saves: [], unchecked: [{ file: "src/main.ts", reason: "?" }] });
    expect(issues.map((i) => i.level)).toEqual(["warning"]);
  });

  it("writes saves.json on the first build, then compares, and accepts on request", () => {
    const root = mkdtempSync(join(tmpdir(), "debuff-saves-"));
    mkdirSync(join(root, ".debuff"));
    const found = (fields: Record<string, string>) =>
      writeFileSync(join(root, ".debuff", "saves-found.json"), JSON.stringify({ saves: [save(fields)], unchecked: [] }));
    found({ best: "number" });
    expect(checkSaves(root)?.accepted).toBe(true);
    found({ best: "string" });
    expect(checkSaves(root)?.issues.map((i) => i.level)).toEqual(["warning"]);
    expect(JSON.parse(readFileSync(join(root, "saves.json"), "utf8")).saves[0].fields.best).toBe("number");
    expect(checkSaves(root, { accept: true })?.issues.map((i) => i.level)).toEqual(["note"]);
    expect(JSON.parse(readFileSync(join(root, "saves.json"), "utf8")).saves[0].fields.best).toBe("string");
  });
});

describe("saves in debuff test", () => {
  const bin = fileURLToPath(new URL("../bin/debuff.js", import.meta.url));
  /** A project whose saved best score became an object, with saves.json still recording a number. */
  const project = () => {
    const root = mkdtempSync(join(tmpdir(), "debuff-test-saves-"));
    mkdirSync(join(root, "src", "scenes"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "g", private: true, type: "module" }));
    writeFileSync(
      join(root, "src", "scenes", "play.ts"),
      `import { Storage } from "@debuffjp/core";\ninterface Best { score: number }\nexport const save = new Storage("game", { best: { score: 0 } as Best });\n`,
    );
    writeFileSync(
      join(root, "saves.json"),
      JSON.stringify({ version: 1, saves: [{ key: "game", file: "src/scenes/play.ts", fields: { best: "number" } }] }),
    );
    return root;
  };
  const run = (root: string, ...args: string[]) =>
    spawnSync(process.execPath, [bin, "test", "--root", root, ...args], {
      encoding: "utf8",
      env: { ...process.env, DEBUFF_TELEMETRY: "off" },
    });

  it("finds saves in TypeScript under src/", async () => {
    expect((await scanSaves(project())).saves).toEqual([
      { key: "game", file: "src/scenes/play.ts", fields: { best: "object", "best.score": "number" } },
    ]);
  });

  it("reports a changed save like the build, and accepts it with --accept-saves", () => {
    const root = project();
    const checked = run(root);
    expect(checked.status).toBe(0);
    expect(checked.stdout + checked.stderr).toContain('field "best" changed from number to object');
    const accepted = run(root, "--accept-saves", "--json");
    expect(accepted.status).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "saves.json"), "utf8")).saves[0].fields.best).toBe("object");
    expect(run(root).stdout).toContain("saves: game unchanged");
  });
});
