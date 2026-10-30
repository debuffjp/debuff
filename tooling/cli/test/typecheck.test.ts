import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTscOutput, typecheck } from "../src/index.js";

// Wherever `typescript` actually resolves: a git worktree inside the repo has no node_modules of its own.
const repoModules = dirname(dirname(createRequire(import.meta.url).resolve("typescript/package.json")));

/** A tiny project that resolves `typescript` from the repo's node_modules. */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "debuff-tsc-"));
  symlinkSync(repoModules, join(root, "node_modules"), "junction");
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, lib: ["ES2022"] }, include: ["src"] }),
  );
  mkdirSync(join(root, "src"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, "src", name), text);
  return root;
}

describe("typecheck", () => {
  it("parses tsc output, joining continuation lines", () => {
    const out = [
      "src/main.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/a.ts(10,1): error TS2345: Argument of type '{ x: string; }' is not assignable to parameter of type 'P'.",
      "  Types of property 'x' are incompatible.",
      "",
    ].join("\n");
    expect(parseTscOutput(out, "/game")).toEqual([
      { file: "src/main.ts", line: 3, column: 7, code: 2322, message: "Type 'string' is not assignable to type 'number'." },
      {
        file: "src/a.ts",
        line: 10,
        column: 1,
        code: 2345,
        message: "Argument of type '{ x: string; }' is not assignable to parameter of type 'P'.\nTypes of property 'x' are incompatible.",
      },
    ]);
  });

  it("reports type errors with the project's own tsc", { timeout: 60_000 }, async () => {
    const root = project({ "main.ts": "export const ok = 1;\nexport const speed: number = 'fast';\n" });
    const r = await typecheck(root);
    expect(r.ok).toBe(true);
    expect(r.diagnostics).toEqual([expect.objectContaining({ file: "src/main.ts", line: 2, code: 2322 })]);
  });

  it("returns no diagnostics for clean code", { timeout: 60_000 }, async () => {
    const r = await typecheck(project({ "main.ts": "export const speed: number = 3;\n" }));
    expect(r).toMatchObject({ ok: true, diagnostics: [] });
  });

  it("is off, not failing, without a tsconfig", async () => {
    const r = await typecheck(mkdtempSync(join(tmpdir(), "debuff-tsc-")));
    expect(r).toMatchObject({ ok: false, reason: "no tsconfig.json", diagnostics: [] });
  });
});
