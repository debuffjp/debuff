import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEBUFF_COAUTHOR, gitEnv, runCreate } from "../src/index.js";

const hasGit = !spawnSync("git", ["--version"]).error;
const saved = { ...process.env };
let dir: string | undefined;
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** Runs the non-interactive flow into a fresh folder and returns the project folder and everything it printed. */
async function create(options: { git?: boolean; credit?: boolean }) {
  dir = mkdtempSync(join(tmpdir(), "create-debuff-run-"));
  const game = join(dir, "game");
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "Test";
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "test@example.com";
  let out = "";
  const capture = (s: unknown) => {
    out += String(s);
    return true;
  };
  vi.spyOn(process.stdout, "write").mockImplementation(capture);
  vi.spyOn(console, "log").mockImplementation((s) => void capture(`${s}\n`));
  expect(await runCreate({ dir: game, yes: true, ...options })).toBe(0);
  return { game, out };
}
const message = (cwd: string) => spawnSync("git", ["log", "--format=%B"], { cwd, encoding: "utf8", env: gitEnv() }).stdout.trim();

describe.skipIf(!hasGit)("runCreate and git", () => {
  it("credits debuff in the first commit and says so, with the flag that turns it off", async () => {
    const { game, out } = await create({});
    expect(message(game)).toContain(DEBUFF_COAUTHOR);
    expect(out).toMatch(/credit.*debuff.*--no-credit/);
  });

  it("--no-credit commits without the trailer or the credit line", async () => {
    const { game, out } = await create({ credit: false });
    expect(message(game)).not.toContain("Co-authored-by");
    expect(out).not.toContain("--no-credit");
    expect(out).toContain("first commit");
  });

  it("--no-git leaves no repository", async () => {
    const { game } = await create({ git: false });
    expect(existsSync(join(game, "package.json"))).toBe(true);
    expect(existsSync(join(game, ".git"))).toBe(false);
  });
});
