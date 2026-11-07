import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DebuffError, describeError, EXIT } from "../src/errors.js";
import { browserLaunchError } from "../src/scenario/run.js";

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

describe("browserLaunchError", () => {
  // Playwright's own messages, as it throws them on Linux.
  const notFound = (name: string, at: string) =>
    new Error(`browserType.launch: Chromium distribution '${name}' is not found at ${at}\nRun "npx playwright install ${name}"`);
  const noLibs = new Error(
    "browserType.launch: Target page, context or browser has been closed\nBrowser logs:\n\n<launching> /home/me/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome --headless\n<launched> pid=1\n[pid=1][err] /home/me/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome: error while loading shared libraries: libnspr4.so: cannot open shared object file: No such file or directory\nCall log:",
  );

  it("says which browsers were tried, where it looked and why one didn't start", () => {
    const err = browserLaunchError({
      chrome: notFound("chrome", "/opt/google/chrome/chrome"),
      msedge: notFound("msedge", "/opt/microsoft/msedge/msedge"),
      chromium: noLibs,
    });
    expect(err.message).toBe(
      "No Chromium-based browser would start. Tried Chrome (not installed at /opt/google/chrome/chrome), Edge (not installed at /opt/microsoft/msedge/msedge), Playwright's Chromium (installed, but it didn't start: error while loading shared libraries: libnspr4.so: cannot open shared object file: No such file or directory). DEBUFF_BROWSER is not set.",
    );
    expect(err.channels).toEqual({ chrome: "missing", msedge: "missing", chromium: "launch failed" });
    const e = describeError(err);
    expect(e).toMatchObject({ code: "browser_not_found", exit: EXIT.setup });
    expect(e.fix).toContain("Install Chrome or Edge");
    expect(e.fix).toContain("DEBUFF_BROWSER");
  });

  it("says when nothing is installed", () => {
    const err = browserLaunchError({ chrome: notFound("chrome", "/opt/google/chrome/chrome") });
    expect(err.message).toMatch(/^No Chromium-based browser found\. Tried Chrome \(not installed at \/opt\/google\/chrome\/chrome\)\./);
  });

  it("names DEBUFF_BROWSER and its path when that browser won't start", () => {
    const err = browserLaunchError(
      { DEBUFF_BROWSER: new Error("browserType.launch: Failed to launch chromium because executable doesn't exist at /nope/chrome") },
      "/nope/chrome",
    );
    expect(err.message).toBe(
      "DEBUFF_BROWSER is set to /nope/chrome, but that browser didn't start: Failed to launch chromium because executable doesn't exist at /nope/chrome",
    );
    expect(describeError(err).fix).toMatch(/^Set DEBUFF_BROWSER to the full path of a Chromium-based browser executable, or unset it/);
  });
});

describe("the CLI's failure contract", () => {
  const error = (stdout: string) => (JSON.parse(stdout) as { error: { code: string } }).error.code;

  it("exits 3 with one JSON error for an unknown command or option", { timeout: 60_000 }, () => {
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
    expect((JSON.parse(r.stdout) as { error: { message: string } }).error.message).toMatch(/^DEBUFF_BROWSER is set to .*no-such-browser/);
  }, 60_000);

  it("prints the empty test report on stdout with --json when a project has no tests", () => {
    const empty = mkdtempSync(join(tmpdir(), "debuff-notests-"));
    writeFileSync(join(empty, "package.json"), JSON.stringify({ name: "empty", private: true }));
    const r = run(["test", "--root", empty, "--json"]);
    rmSync(empty, { recursive: true, force: true });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, passed: 0, results: [] }); // one document, on stdout
  }, 60_000);

  it("exits 2 with nothing_to_run when a project has no scenarios", () => {
    const empty = mkdtempSync(join(tmpdir(), "debuff-empty-"));
    writeFileSync(join(empty, "package.json"), JSON.stringify({ name: "empty", private: true }));
    const r = run(["scenario", "--root", empty, "--json"]);
    rmSync(empty, { recursive: true, force: true });
    expect([r.status, error(r.stdout)]).toEqual([2, "nothing_to_run"]);
  }, 60_000);
});
