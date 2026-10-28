import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DebuffError, describeError, EXIT } from "../src/errors.js";

const bin = fileURLToPath(new URL("../bin/debuff.js", import.meta.url));
const template = fileURLToPath(new URL("../../../templates/basic", import.meta.url));
const run = (args: string[], env: NodeJS.ProcessEnv = {}) =>
  spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", env: { ...process.env, DEBUFF_TELEMETRY: "off", ...env } });

describe("describeError", () => {
  it("keeps the code and fix of a DebuffError, with the exit code for its kind", () => {
    expect(describeError(new DebuffError("config_invalid", "bad", "fix it"))).toEqual({
      code: "config_invalid",
      message: "bad",
      fix: "fix it",
      transient: false,
      exit: EXIT.setup,
    });
    expect(describeError(new DebuffError("bad_option", "nope")).exit).toBe(EXIT.usage);
  });

  it("recognises a missing browser, a busy port and a network failure", () => {
    expect(describeError(new Error("browserType.launch: Failed to launch chromium")).code).toBe("browser_not_found");
    expect(describeError(Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" }))).toMatchObject({
      code: "port_in_use",
      exit: 2,
    });
    expect(describeError(Object.assign(new Error("getaddrinfo"), { code: "ENOTFOUND" }))).toMatchObject({
      code: "network",
      transient: true,
      exit: 1,
    });
  });

  it("calls anything else unexpected and points at doctor and the issue tracker", () => {
    expect(describeError("boom")).toMatchObject({ code: "unexpected", exit: 1, transient: false, fix: expect.stringContaining("doctor") });
  });
});

describe("the CLI's failure contract", () => {
  const error = (stdout: string) => (JSON.parse(stdout) as { error: { code: string } }).error.code;

  it("exits 3 with one JSON error for an unknown command or option", () => {
    const command = run(["nosuch", "--json"]);
    expect([command.status, error(command.stdout)]).toEqual([3, "unknown_command"]);
    const option = run(["inspect", "--root", template, "--nonsense"]);
    expect([option.status, error(option.stdout)]).toEqual([3, "bad_option"]);
  });

  it("exits 2 with a setup error when the browser can't start, and nothing but JSON on stdout", () => {
    const r = run(["scenario", "--root", template, "--json"], {
      DEBUFF_BROWSER: fileURLToPath(new URL("./no-such-browser", import.meta.url)),
    });
    expect(r.status).toBe(2);
    expect(error(r.stdout)).toBe("browser_not_found");
  }, 60_000);

  it("exits 2 with nothing_to_run when a project has no scenarios", () => {
    const empty = mkdtempSync(join(tmpdir(), "debuff-empty-"));
    writeFileSync(join(empty, "package.json"), JSON.stringify({ name: "empty", private: true }));
    const r = run(["scenario", "--root", empty, "--json"]);
    rmSync(empty, { recursive: true, force: true });
    expect([r.status, error(r.stdout)]).toEqual([2, "nothing_to_run"]);
  }, 60_000);
});
