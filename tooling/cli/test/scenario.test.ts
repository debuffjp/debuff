import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { callHooks, stepUntil } from "../src/scenario/browser.js";
import { captureDiffMessage, compare, pick, runScenarios, unusedBaselines } from "../src/scenario/index.js";
import { CheckpointCheck, comparisonError, nextBatch, runStep } from "../src/scenario/run.js";
import type { ScenarioReport, Step } from "../src/scenario/types.js";

describe("compare", () => {
  it("passes matching comparisons", () => {
    expect(compare(5, { gt: 4, lt: 6, gte: 5, lte: 5 })).toBeUndefined();
    expect(compare({ a: 1 }, { eq: { a: 1 } })).toBeUndefined();
    expect(compare(10.2, { approx: [10, 0.5] })).toBeUndefined();
  });

  it("explains failures", () => {
    expect(compare(3, { gt: 4 })).toBe("expected > 4, got 3");
    expect(compare("menu", { eq: "play" })).toBe('expected "play", got "menu"');
    expect(compare(undefined, { gt: 0 })).toMatch(/got undefined/);
  });
});

describe("captureDiffMessage", () => {
  it("names the actual, baseline and diff images and says how to accept the change", () => {
    const root = process.platform === "win32" ? "C:game" : "/game";
    const at = (...p: string[]) => [root, ...p].join(process.platform === "win32" ? "\\" : "/");
    const msg = captureDiffMessage(
      "popped",
      {
        name: "popped",
        status: "diff",
        diffRatio: 0.995,
        path: at(".debuff", "captures", "s", "popped.png"),
        baseline: at("scenarios", "__baselines__", "s", "popped.win32.png"),
        diff: at(".debuff", "captures", "s", "popped.diff.png"),
      },
      0.002,
      root,
    );
    expect(msg).toContain("99.50% of pixels");
    expect(msg).toContain("actual:   .debuff/captures/s/popped.png");
    expect(msg).toContain("baseline: scenarios/__baselines__/s/popped.win32.png");
    expect(msg).toContain("diff:     .debuff/captures/s/popped.diff.png");
    expect(msg).toContain("If this change is intended, run `npx debuff scenario --update`.");
  });
});

describe("pick", () => {
  it("reads event counts as 0 until the first emit", () => {
    const state = { events: { coin: 2 }, state: { x: 1 } };
    expect(pick(state, "events.coin")).toBe(2);
    expect(pick(state, "events.win")).toBe(0);
    expect(pick(state, "state.y")).toBeUndefined();
  });
});

describe("stepUntil", () => {
  it("steps until the conditions hold, or gives up after within", () => {
    let tick = 0;
    const hooks = { state: () => ({ tick, events: tick >= 5 ? { coin: 1 } : {} }), step: () => tick++ };
    (globalThis as { window?: unknown }).window = { __DEBUFF_DEV__: hooks };
    try {
      expect(stepUntil([{ "events.coin": { gte: 1 } }, 60])).toEqual({ ticks: 5, met: true });
      expect(stepUntil([{ tick: { eq: 5 } }, 3])).toEqual({ ticks: 0, met: true });
      expect(stepUntil([{ tick: { gt: 100 } }, 3])).toEqual({ ticks: 3, met: false });
      expect(tick).toBe(8);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});

/** Run steps against a fake page, returning the dev hook calls and any failure messages. */
async function play(steps: Step[], state: unknown = {}) {
  const calls: unknown[][] = [];
  const call = async <R>(method: string, ...args: unknown[]) => {
    calls.push([method, ...args]);
    return (method === "state" ? state : undefined) as R;
  };
  const failures: (string | undefined)[] = [];
  const never = () => Promise.reject(new Error("not used"));
  for (const step of steps) failures.push(await runStep(step, call, never, never, never));
  return { calls, failures };
}

describe("runStep: wheel and touch", () => {
  it("drives the dev hooks' wheel and touch methods", async () => {
    const { calls } = await play([
      { wheel: -40 },
      { wheel: [10, 5] },
      { touchDown: [2, 10, 20] },
      { touchDown: [3, 1, 1, "pen"] },
      { touchMove: [2, 15, 25] },
      { touchUp: 2 },
      { press: "PointerRight" },
    ]);
    expect(calls).toEqual([
      ["wheel", -40],
      ["wheel", 10, 5],
      ["touchDown", 2, 10, 20],
      ["touchDown", 3, 1, 1, "pen"],
      ["touchMove", 2, 15, 25],
      ["touchUp", 2],
      ["press", "PointerRight"],
    ]);
  });
});

describe("runStep: pointer kind", () => {
  it("passes a touch or pen kind to the dev hooks", async () => {
    const { calls } = await play([{ pointerDown: [1, 2, "touch"] }, { pointerDown: [3, 4] }, { tap: [5, 6, "pen"] }]);
    expect(calls).toEqual([
      ["pointerDown", 1, 2, "touch"],
      ["pointerDown", 3, 4],
      ["tap", 5, 6, "pen"],
    ]);
  });
});

describe("runStep: tap with a key and malformed comparisons", () => {
  it("taps a key for one step when tap is a key code, instead of spreading the string into tap(x, y)", async () => {
    const { calls, failures } = await play([{ tap: "KeyT" }, { tap: [3, 4] }]);
    expect(calls).toEqual([
      ["press", "KeyT"],
      ["step", 1],
      ["release", "KeyT"],
      ["tap", 3, 4],
    ]);
    expect(failures).toEqual([undefined, undefined]);
    const bad = await play([{ tap: 5 } as unknown as Step]);
    expect(bad.failures[0]).toMatch(/tap: expected a key code like "KeyT" or a point \[x, y\], got 5/);
  });

  it("explains a bare value where a comparison object was meant", async () => {
    const { failures } = await play([{ expect: { "state.x": 0 } } as unknown as Step], { state: { x: 0 } });
    expect(failures[0]).toBe(
      'state.x: expected a comparison object like { "eq": 0 }, got 0. Comparisons are eq, gt, gte, lt, lte and approx',
    );
    const until = await play([{ until: { scene: "play" } } as unknown as Step]);
    expect(until.failures[0]).toMatch(/^until: scene: expected a comparison object like \{ "eq": "play" \}/);
    expect(comparisonError({ equals: 1 })).toMatch(/with eq, gt, gte, lt, lte or approx, got \{"equals":1\}/);
    expect(comparisonError({ eq: 0 })).toBeUndefined();
  });
});

describe("CheckpointCheck", () => {
  const at = (tick: number, checkpoint: Record<string, string>) => ({ tick, checkpoint });

  it("warns once, at the first checkpoint that differs, with the parts and the last match", () => {
    const check = new CheckpointCheck();
    expect(check.check({ scene: "a", "state.x": "1" }, at(60, { scene: "a", "state.x": "1" }))).toBeUndefined();
    const warning = check.check({ scene: "a", "state.x": "1" }, at(120, { scene: "a", "state.x": "2", "state.y": "1" }));
    expect(warning).toContain("stopped matching the recording at tick 120: state.x, state.y differ (it matched at tick 60).");
    expect(check.check({ scene: "a" }, at(180, { scene: "b" }))).toBeUndefined();
  });

  it("says when the game's dev tools are too old to check", () => {
    const check = new CheckpointCheck();
    expect(check.check({ scene: "a" }, null)).toMatch(/^checkpoints not checked: .*older than 0\.31/);
    expect(check.check({ scene: "a" }, null)).toBeUndefined();
  });
});

describe("nextBatch", () => {
  it("groups input, waits and checkpoints, and stops at steps the runner plays itself", () => {
    const steps: Step[] = [
      { wait: 3 },
      { press: "KeyA" },
      { tap: "KeyT" },
      { checkpoint: { scene: "1" } },
      { expect: { tick: { eq: 4 } } },
      { pointerMove: [1, 2] },
    ];
    const batch = nextBatch(steps, 0);
    expect(batch.map((b) => b.index)).toEqual([0, 1, 2, 3]);
    expect(batch.flatMap((b) => b.calls)).toEqual([
      ["step", [3]],
      ["press", ["KeyA"]],
      ["press", ["KeyT"]],
      ["step", [1]],
      ["release", ["KeyT"]],
      ["checkpoint", []],
    ]);
    expect(nextBatch(steps, 4)).toEqual([]);
    expect(nextBatch(steps, 5).map((b) => b.index)).toEqual([5]);
  });

  it("caps a batch at ten seconds of play, keeps a long wait on its own and leaves malformed steps to runStep", () => {
    const steps: Step[] = [{ wait: 400 }, { wait: 100 }, { wait: 200 }, { wait: 5000 }, { tap: 5 } as unknown as Step];
    expect(nextBatch(steps, 0).map((b) => b.index)).toEqual([0, 1]);
    expect(nextBatch(steps, 2).map((b) => b.index)).toEqual([2]);
    expect(nextBatch(steps, 3).map((b) => b.index)).toEqual([3]);
    expect(nextBatch(steps, 4)).toEqual([]);
  });
});

describe("callHooks", () => {
  const withHooks = async <R>(hooks: Record<string, unknown>, fn: () => Promise<R>) => {
    (globalThis as { window?: unknown }).window = { __DEBUFF_DEV__: hooks };
    try {
      return await fn();
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  };

  it("makes the calls in order, returns only checkpoints, and stops at the first that throws", async () => {
    const calls: string[] = [];
    const hooks = {
      step: (n: number) => calls.push(`step ${n}`),
      press: async (c: string) => calls.push(`press ${c}`),
      checkpoint: () => ({ tick: 3, checkpoint: { scene: "1" } }),
      command: () => {
        throw new Error("Unknown command");
      },
    };
    const ok = await withHooks(hooks, () =>
      callHooks([
        ["step", [3]],
        ["press", ["KeyA"]],
        ["checkpoint", []],
      ]),
    );
    expect(ok).toEqual({ checkpoints: { 2: { tick: 3, checkpoint: { scene: "1" } } } });
    expect(calls).toEqual(["step 3", "press KeyA"]);
    const bad = await withHooks(hooks, () =>
      callHooks([
        ["step", [1]],
        ["command", ["warp"]],
        ["step", [1]],
      ]),
    );
    expect(bad).toEqual({ checkpoints: {}, failed: { at: 1, message: "Unknown command" } });
  });

  it("returns null for checkpoints and explains other hooks when the game's dev tools are older", async () => {
    const result = await withHooks({ step: () => undefined }, () =>
      callHooks([
        ["checkpoint", []],
        ["touchUp", [1]],
      ]),
    );
    expect(result.checkpoints).toEqual({ 0: null });
    expect(result.failed).toMatchObject({ at: 1, message: expect.stringContaining('Unknown dev hook "touchUp"') });
  });
});

describe("unusedBaselines", () => {
  const report = (name: string, ok: boolean, captures: string[]): ScenarioReport => ({
    name,
    ok,
    steps: [],
    errors: [],
    captures: captures.map((c) => ({ name: c, path: "", baseline: "", status: "match" as const })),
    finalState: undefined,
    durationMs: 0,
  });

  it("lists folders with no scenario and captures a passing scenario no longer takes", () => {
    const root = mkdtempSync(join(tmpdir(), "debuff-baselines-"));
    const base = join(root, "scenarios", "__baselines__");
    for (const [dir, file] of [
      ["play", "now.linux.png"],
      ["play", "now.win32.png"],
      ["play", "old.win32.png"],
      ["gone", "x.linux.png"],
      ["broken", "late.linux.png"],
    ] as const) {
      mkdirSync(join(base, dir), { recursive: true });
      writeFileSync(join(base, dir, file), "png");
    }
    // "broken" failed, so its later captures may simply not have run: left alone.
    const unused = unusedBaselines(root, [report("play", true, ["now"]), report("broken", false, [])]);
    expect(unused).toEqual(["scenarios/__baselines__/gone/", "scenarios/__baselines__/play/old.win32.png"]);
  });

  it("is empty without baselines", () => {
    expect(unusedBaselines(mkdtempSync(join(tmpdir(), "debuff-baselines-")), [])).toEqual([]);
  });
});

describe("scenario browser failures", () => {
  const template = fileURLToPath(new URL("../../../templates/basic", import.meta.url));
  const run = async (name: string, script: () => unknown, extra: object = {}) => {
    // Inside the project: a temp folder can be on another drive, which a relative path can't reach.
    const dir = join(template, ".debuff", "test-scenarios");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name}.json`);
    writeFileSync(file, JSON.stringify({ name, ...extra, steps: [{ "probe:run": null }, { wait: 1 }] }));
    const plugin = {
      name: "probe",
      scenarioSteps: [
        {
          name: "run",
          run: async (_: unknown, context: { evaluate: <R, A>(fn: (arg: A) => R, arg: A) => Promise<R> }) => {
            await context.evaluate(script, undefined);
            return undefined;
          },
        },
      ],
    };
    const [report] = await runScenarios({
      root: template,
      files: [relative(template, file)],
      plugins: [plugin] as never,
      update: false,
      strict: false,
    });
    if (!report) throw new Error("no report");
    return report;
  };

  it("fails a hung game at its step and stops the scenario", async () => {
    const report = await run(
      "hung",
      () => {
        for (;;);
      },
      { stepTimeout: 1 },
    );
    expect(report.ok).toBe(false);
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0]?.message).toMatch(/stopped responding/);
  }, 60_000);

  it("reports console errors and failed requests as warnings without failing", async () => {
    const report = await run("noisy", async () => {
      console.error("boom\nsecond line");
      await fetch("/assets/definitely-missing.png");
      await fetch("/definitely-missing.json");
    });
    expect(report.ok).toBe(true);
    expect(report.warnings).toContain("console error: boom");
    expect(report.warnings.some((w) => /definitely-missing\.png \(HTTP 404\)/.test(w))).toBe(true);
    expect(report.warnings.some((w) => /definitely-missing\.json \(got the HTML page/.test(w))).toBe(true);
    expect(report.warnings.some((w) => w.includes("Failed to load resource"))).toBe(false);
  }, 60_000);
});
