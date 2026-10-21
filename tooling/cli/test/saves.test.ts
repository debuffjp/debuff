import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAst } from "vite";
import { describe, expect, it } from "vitest";
import { checkSaves, compareSaves, findSaves, type SaveInfo } from "../src/index.js";

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
