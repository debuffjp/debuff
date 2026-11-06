import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** What `debuff test --json` prints: keiko's report, plus the saves check when the game has saves. */
export interface TestReport {
  ok: boolean;
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  durationMs: number;
  results: { fullName: string; file: string; status: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

/** The `debuff` bin of the @debuffjp/cli this server depends on. */
function debuffBin(): string {
  const main = createRequire(import.meta.url).resolve("@debuffjp/cli"); // .../dist/index.js
  return join(dirname(dirname(main)), "bin", "debuff.js");
}

/**
 * Run the project's logic tests with `debuff test --json` in a child process. keiko runs a test by replacing
 * process globals (timers, Date, performance, window, document) for its duration; in this long-lived server
 * those globals are also the MCP SDK's and Playwright's, so their timers stopped firing during a run, and two
 * overlapping runs could restore them out of order and leave the process patched. A child process has its own.
 * It also runs exactly what a human's `debuff test` runs.
 */
export function runTestsInChild(root: string, options: { files?: string[]; filter?: string } = {}): Promise<TestReport> {
  if (!existsSync(join(root, "package.json")))
    return Promise.reject(new Error(`No package.json in ${root}. Pass the game's folder as root.`));
  const args = [
    debuffBin(),
    "test",
    "--json",
    "--root",
    root,
    ...(options.filter ? ["--filter", options.filter] : []),
    ...(options.files ?? []),
  ];
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      args,
      { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60_000, env: { ...process.env, NO_COLOR: "1" } },
      (err, stdout, stderr) => {
        let parsed: (TestReport & { error?: { message?: string; fix?: string } }) | undefined;
        try {
          parsed = JSON.parse(stdout) as TestReport;
        } catch {}
        if (parsed?.error) {
          const { message, fix } = parsed.error;
          reject(new Error(fix ? `${message} ${fix}` : String(message)));
        } else if (parsed && typeof parsed.ok === "boolean")
          resolve(parsed); // failing tests exit 1 with a report
        else
          reject(
            new Error(`debuff test failed${err ? ` (${err.message.split("\n")[0]})` : ""}: ${stderr.trim().slice(-2000) || "no output"}`),
          );
      },
    );
  });
}
