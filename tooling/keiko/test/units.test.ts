import { describe, it, expect as vexpect } from "vitest";
import { describeSteps, toSteps } from "../src/duration.js";
import { ExpectationError, expect } from "../src/expect.js";
import { Trace } from "../src/trace.js";
import { deepEqual, firstDifference, pick, show } from "../src/values.js";

const STEP = 1 / 60;

describe("durations", () => {
  it("reads steps, seconds and milliseconds", () => {
    vexpect(toSteps(30, STEP)).toBe(30);
    vexpect(toSteps("0.5s", STEP)).toBe(30);
    vexpect(toSteps("250ms", STEP)).toBe(15);
    vexpect(toSteps(" .1s ", STEP)).toBe(6);
    vexpect(toSteps("0s", STEP)).toBe(0);
  });

  it("rejects fractions of steps and unknown units, saying what to write instead", () => {
    vexpect(() => toSteps(1.5, STEP)).toThrow(/write "1.5s"/);
    vexpect(() => toSteps(-1, STEP)).toThrow(/0 or more/);
    vexpect(() => toSteps("2m" as never, STEP)).toThrow(/Can't read the duration "2m"/);
  });

  it("describes step counts as time", () => {
    vexpect(describeSteps(1, STEP)).toBe("1 step (0.02s)");
    vexpect(describeSteps(42, STEP)).toBe("42 steps (0.70s)");
  });
});

describe("values", () => {
  it("picks dotted paths, including array indices", () => {
    const s = { player: { x: 3 }, enemies: [{ hp: 2 }] };
    vexpect(pick(s, "player.x")).toBe(3);
    vexpect(pick(s, "enemies.0.hp")).toBe(2);
    vexpect(pick(s, "player.y.z")).toBeUndefined();
    vexpect(pick(s, "")).toBe(s);
  });

  it("finds the first path where two values differ", () => {
    vexpect(firstDifference({ a: { b: [1, 2] } }, { a: { b: [1, 3] } })).toBe("a.b.1");
    vexpect(firstDifference({ a: 1 }, { a: 1, b: 2 })).toBe("b");
    vexpect(firstDifference(1, 2)).toBe("");
    vexpect(firstDifference([1], { 0: 1 })).toBe("");
    vexpect(firstDifference(Number.NaN, Number.NaN)).toBeUndefined();
    vexpect(firstDifference(new Date(5), new Date(5))).toBeUndefined();
    vexpect(firstDifference(new Date(5), new Date(6))).toBe("");
    vexpect(firstDifference(new Map([["a", 1]]), new Map([["a", 2]]))).toBe("0.1");
    vexpect(deepEqual(new Set([1, 2]), new Set([1, 2]))).toBe(true);
  });

  it("shows values briefly", () => {
    vexpect(show("hi")).toBe('"hi"');
    vexpect(show(undefined)).toBe("undefined");
    vexpect(show(Number.NaN)).toBe("NaN");
    vexpect(show(() => 1)).toMatch(/^\[Function/);
    vexpect(show(10n)).toBe("10n");
    vexpect(show(new Error("boom"))).toBe("Error: boom");
    vexpect(show(new Set([1]))).toBe("Set([1])");
    vexpect(show(new Map([["a", 1]]))).toBe('Map([["a",1]])');
    vexpect(show("x".repeat(500), 10)).toHaveLength(10);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    vexpect(show(cyclic)).toBe("[object Object]");
  });
});

describe("expect", () => {
  const fails = (fn: () => void, message: RegExp) => {
    vexpect(fn).toThrow(ExpectationError);
    vexpect(fn).toThrow(message);
  };

  it("passes when the value matches", () => {
    expect(3).toBe(3);
    expect({ a: [1] }).toEqual({ a: [1] });
    expect(5).toBeAbove(4);
    expect(3).toBeBelow(4);
    expect(4).toBeAtLeast(4);
    expect(4).toBeAtMost(4);
    expect(4).toBeBetween(1, 5);
    expect(1.0004).toBeCloseTo(1);
    expect(1).toBeTruthy();
    expect(0).toBeFalsy();
    expect(0).toBeDefined();
    expect(undefined).toBeUndefined();
    expect([{ a: 1 }]).toContain({ a: 1 });
    expect("hello").toContain("ell");
    expect([1, 2]).toHaveLength(2);
    expect("abc").toMatch(/b/);
    expect(() => {
      throw new Error("nope");
    }).toThrow("nope");
    expect(() => {
      throw new Error("nope");
    }).toThrow(/no/);
  });

  it("explains failures with the actual value", () => {
    fails(() => expect(3).toBe(4), /expected 3 to be 4/);
    fails(() => expect({ a: { b: 1 } }).toEqual({ a: { b: 2 } }), /first difference at a\.b/);
    fails(() => expect(1).toBeAbove(2), /expected 1 to be above 2/);
    fails(() => expect(1.2).toBeCloseTo(1, 0.1), /1 ± 0.1 \(off by 0.200\)/);
    fails(() => expect(9).toBeBetween(1, 5), /between 1 and 5/);
    fails(() => expect([1]).toHaveLength(2), /length 2 \(has 1\)/);
    fails(() => expect(() => {}).toThrow(), /\(it didn't throw\)/);
    fails(() => expect([1]).toContain(2), /contain 2/);
  });

  it("inverts with .not", () => {
    expect(3).not.toBe(4);
    expect(() => {}).not.toThrow();
    fails(() => expect(3).not.toBe(3), /expected 3 not to be 3/);
    fails(() => expect(3).not.not.toBe(4), /expected 3 to be 4/);
  });

  it("says when a matcher got the wrong kind of value", () => {
    fails(() => expect("3").toBeAbove(2), /toBeAbove needs a number, got "3"/);
    fails(() => expect(Number.NaN).toBeBelow(2), /needs a number, got NaN/);
    fails(() => expect(3).toContain(3), /toContain needs an array or string/);
    fails(() => expect(3).toHaveLength(1), /toHaveLength needs an array or string/);
    fails(() => expect(3).toMatch(/3/), /toMatch needs a string/);
    fails(() => expect(3).toThrow(), /toThrow needs a function/);
  });

  it("keeps the expected value on the error", () => {
    try {
      expect(1).toBe(2);
    } catch (err) {
      vexpect(err).toMatchObject({ actual: 1, expected: 2, name: "ExpectationError" });
    }
  });
});

describe("Trace", () => {
  const y = new Trace([90, 80, 75, 80, 90, 90], 100, "player.y", STEP);

  it("answers questions about a value over time", () => {
    vexpect(y.length).toBe(6);
    vexpect([y.start, y.first, y.last, y.at(2), y.at(-2)]).toEqual([100, 90, 90, 75, 90]);
    vexpect([y.min(), y.max(), y.range()]).toEqual([75, 90, 15]);
    vexpect(y.stepOf(75)).toBe(2);
    vexpect(y.stepOf((v, i) => i > 0 && v === 90)).toBe(4);
    vexpect(y.every((v) => v < 100)).toBe(true);
    vexpect(y.some((v) => v === 80)).toBe(true);
    vexpect(y.changes()).toBe(5);
    vexpect(y.timeAt(59)).toBeCloseTo(1);
    vexpect([...y]).toEqual([90, 80, 75, 80, 90, 90]);
  });

  it("explains misuse", () => {
    vexpect(() => y.at(6)).toThrow(/has 6 steps; there's no step 6/);
    vexpect(() => new Trace([], 0, "x", STEP).max()).toThrow(/is empty/);
    vexpect(() => new Trace(["a"], 0, "scene", STEP).min()).toThrow(/min\(\) needs numbers, but scene was a at step 0/);
  });
});

describe("keiko init", () => {
  it("writes a first test for the engine it finds, and never overwrites one", async () => {
    const { mkdtempSync, readFileSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { detectEngine, init } = await import("../src/init.js");
    const root = mkdtempSync(join(tmpdir(), "keiko-init-"));
    const log = console.log;
    console.log = () => {};
    try {
      expect(init(root)).toBe(1); // no index.html
      writeFileSync(join(root, "index.html"), '<script type="module" src="/src/main.js"></script>');
      writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { "pixi.js": "^8.0.0" } }));
      expect(detectEngine(root)).toBe("pixi");
      expect(init(root)).toBe(0);
      const test = readFileSync(join(root, "tests", "smoke.test.js"), "utf8");
      expect(test).toContain("g.engine?.scene !== undefined");
      writeFileSync(join(root, "tests", "smoke.test.js"), "// mine");
      expect(init(root)).toBe(0);
      expect(readFileSync(join(root, "tests", "smoke.test.js"), "utf8")).toBe("// mine");
      writeFileSync(join(root, "package.json"), JSON.stringify({ devDependencies: { "@debuffjp/cli": "^0.3.0", phaser: "^3" } }));
      expect(detectEngine(root)).toBe("debuff");
    } finally {
      console.log = log;
    }
  });
});
