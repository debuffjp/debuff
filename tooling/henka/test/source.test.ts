import { parseSync } from "vite";
import { describe, expect, it } from "vitest";
import { applyMutant, findMutants, type Parse } from "../src/source.js";

const parse = parseSync as unknown as Parse;
const mutate = (code: string) => findMutants("src/a.ts", code, parse).map((m) => applyMutant(code, m));

describe("findMutants", () => {
  it("swaps arithmetic, comparison, equality and logical operators", () => {
    expect(mutate("f(a * b);")).toEqual(["f(a / b);"]);
    expect(mutate("f(a < b);")).toEqual(["f(a <= b);"]);
    expect(mutate("f(a === b);")).toEqual(["f(a !== b);"]);
    expect(mutate("f(a && b);")).toEqual(["f(a || b);"]);
    expect(mutate("x += y;")).toEqual(["x -= y;"]);
    expect(mutate("i++;")).toEqual(["i--;"]);
    expect(mutate("f(!a);")).toEqual(["f(a);"]);
  });

  it("finds the operator past parentheses and comments", () => {
    expect(mutate("f((a) /* - */ - (b));")).toEqual(["f((a) /* - */ + (b));"]);
  });

  it("changes numbers, but not numbers used as names", () => {
    expect(mutate("const o = { 1: speed(140) };")).toEqual(["const o = { 1: speed(0) };"]);
    expect(mutate("f(0);")).toEqual(["f(1);"]);
  });

  it("leaves string joins, types and imports alone", () => {
    expect(mutate('f("a" + b);')).toEqual([]);
    expect(mutate("let x: 1 | 2 = y as unknown as 3;")).toEqual([]);
    expect(mutate('import a from "./a"; export * from "./b";')).toEqual([]);
  });

  it("still mutates code inside `as` and `!`", () => {
    expect(mutate("f((a - b) as number);")).toEqual(["f((a + b) as number);"]);
  });

  it("replaces function bodies by their return type", () => {
    expect(mutate("function f(): boolean { return g(); }")).toEqual([
      "function f(): boolean { return true; }",
      "function f(): boolean { return false; }",
    ]);
    expect(mutate("function f() { g(); }")).toEqual(["function f() {}"]);
    expect(mutate("function f() { return g(); }")).toEqual([]);
  });

  it("skips lines marked henka-skip, and files marked henka-skip-file", () => {
    expect(mutate("// henka-skip\nf(a - b);\nf(c - d);")).toEqual(["// henka-skip\nf(a - b);\nf(c + d);"]);
    expect(mutate("// henka-skip-file\nf(a - b);")).toEqual([]);
  });

  it("labels mutants with the file, line and a before and after", () => {
    const [m] = findMutants("src/ease.ts", "export const outQuad = (t) =>\n  t * (2 - t);", parse);
    expect(m).toMatchObject({ line: 2, column: 5, label: "src/ease.ts:2:5 t * (2 - t) → t / (2 - t)", expect: "noticed" });
  });
});
