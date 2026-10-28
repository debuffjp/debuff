import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isNewer, planUpgrade, runUpgrade, updateHint } from "../src/index.js";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** A fake registry answering `version` for the latest release, counting its calls. */
const registry = (version: string | undefined) => {
  const calls: string[] = [];
  const fetch = (async (url: string) => {
    calls.push(String(url));
    if (version === undefined) throw new Error("offline");
    return new Response(JSON.stringify({ version }));
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
};

describe("isNewer", () => {
  it("compares numeric parts, with a prerelease before its release", () => {
    expect(isNewer("0.20.0", "0.19.3")).toBe(true);
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("0.20.0", "0.20.0")).toBe(false);
    expect(isNewer("0.20.0", "0.20.0-beta.1")).toBe(true);
    expect(isNewer("0.19.9", "0.20.0")).toBe(false);
  });
});

describe("updateHint", () => {
  it("checks at most once a day, says so only on the run that checks, and stays quiet offline or in CI", async () => {
    dir = mkdtempSync(join(tmpdir(), "debuff-hint-"));
    const configFile = join(dir, "config.json");
    const env = {};
    const newer = registry("0.21.0");
    expect(await updateHint("0.20.0", { env, configFile, fetch: newer.fetch, now: 0 })).toBe(
      "debuff 0.21.0 is out (you have 0.20.0): npx debuff upgrade",
    );
    expect(await updateHint("0.20.0", { env, configFile, fetch: newer.fetch, now: 1000 })).toBeUndefined();
    expect(newer.calls).toHaveLength(1);
    expect(await updateHint("0.20.0", { env, configFile, fetch: newer.fetch, now: 2 * 86_400_000 })).toMatch(/0\.21\.0 is out/);
    expect(await updateHint("0.21.0", { env, configFile: join(dir, "b.json"), fetch: newer.fetch, now: 0 })).toBeUndefined();
    expect(await updateHint("0.20.0", { env, configFile: join(dir, "c.json"), fetch: registry(undefined).fetch, now: 0 })).toBeUndefined();
    expect(
      await updateHint("0.20.0", { env: { CI: "true" }, configFile: join(dir, "d.json"), fetch: newer.fetch, now: 0 }),
    ).toBeUndefined();
    expect(
      await updateHint("0.20.0", { env: { DEBUFF_UPDATE_CHECK: "0" }, configFile: join(dir, "e.json"), fetch: newer.fetch }),
    ).toBeUndefined();
  });
});

describe("upgrade", () => {
  const project = (deps: Record<string, string>, devDeps: Record<string, string> = {}) => {
    dir = mkdtempSync(join(tmpdir(), "debuff-upgrade-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "jelly", dependencies: deps, devDependencies: devDeps }));
    return dir;
  };

  it("moves every debuff package together, keeping each range's style, and leaves other packages alone", async () => {
    const root = project(
      { "@debuffjp/core": "^0.19.0", "@debuffjp/input": "0.19.0", "@debuffjp/tenten": "^1.0.0", lodash: "^4.0.0" },
      {
        "@debuffjp/cli": "~0.19.0",
        "create-debuff": "^0.19.0",
      },
    );
    const plan = await planUpgrade(root, { fetch: registry("0.20.0").fetch });
    expect(plan.to).toBe("0.20.0");
    expect(plan.packages.map((p) => `${p.name} ${p.to}`)).toEqual([
      "@debuffjp/core ^0.20.0",
      "@debuffjp/input 0.20.0",
      "@debuffjp/cli ~0.20.0",
      "create-debuff ^0.20.0",
    ]);
    const result = await runUpgrade(root, { fetch: registry("0.20.0").fetch, install: false });
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(result.changes).toBe(true);
    expect(pkg.dependencies).toEqual({
      "@debuffjp/core": "^0.20.0",
      "@debuffjp/input": "0.20.0",
      "@debuffjp/tenten": "^1.0.0",
      lodash: "^4.0.0",
    });
    expect(pkg.devDependencies).toEqual({ "@debuffjp/cli": "~0.20.0", "create-debuff": "^0.20.0" });
  });

  it("changes nothing on a dry run or when already current, and never downgrades without --to", async () => {
    const root = project({ "@debuffjp/core": "^0.20.0", "@debuffjp/dev": "^0.21.0-beta.1" });
    const before = readFileSync(join(root, "package.json"), "utf8");
    expect((await planUpgrade(root, { fetch: registry("0.20.0").fetch })).changes).toBe(false);
    expect((await runUpgrade(root, { to: "0.21.0", dryRun: true, install: false })).changes).toBe(true);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
    expect((await planUpgrade(root, { to: "0.19.0" })).packages.map((p) => p.to)).toEqual(["^0.19.0", "^0.19.0"]);
  });

  it("explains a project with no debuff packages, and an unreachable registry", async () => {
    await expect(planUpgrade(project({ lodash: "^4.0.0" }), { fetch: registry("0.20.0").fetch })).rejects.toMatchObject({
      code: "not_a_project",
    });
    rmSync(dir, { recursive: true, force: true });
    await expect(planUpgrade(project({ "@debuffjp/core": "^0.19.0" }), { fetch: registry(undefined).fetch })).rejects.toMatchObject({
      code: "network",
    });
  });
});
