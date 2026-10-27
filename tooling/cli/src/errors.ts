/**
 * The failure contract that agents and scripts read (docs: tooling/cli/README.md, "Exit codes and errors").
 * The exit code says what to do next; `code` says what went wrong and never changes meaning between releases.
 */
export const EXIT = {
  ok: 0,
  /** The run reported a failure (a test, scenario, fuzz finding or leak), or something unexpected broke. Read the report or the error. */
  failed: 1,
  /** The project or machine needs fixing before the command can run. Run `debuff doctor` and act on its fixes. */
  setup: 2,
  /** Bad input: an unknown command or option, or a value that can't be used. Fix the command line. */
  usage: 3,
} as const;

export type ErrorCode =
  | "unknown_command"
  | "bad_option"
  | "not_a_project"
  | "config_invalid"
  | "browser_not_found"
  | "dev_hooks_missing"
  | "port_in_use"
  | "network"
  | "unexpected";

export interface ErrorReport {
  code: ErrorCode;
  message: string;
  /** One command or edit that fixes it, when there is one. */
  fix?: string;
  /** True when the same command may succeed if retried as it is (a network blip). */
  transient: boolean;
  exit: 1 | 2 | 3;
}

/** An error whose code and fix are known where it's thrown. */
export class DebuffError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fix?: string,
  ) {
    super(message);
    this.name = "DebuffError";
  }
}

const EXITS: Record<ErrorCode, 1 | 2 | 3> = {
  unknown_command: 3,
  bad_option: 3,
  not_a_project: 3,
  config_invalid: 2,
  browser_not_found: 2,
  dev_hooks_missing: 2,
  port_in_use: 2,
  network: 1,
  unexpected: 1,
};

const FIXES: Partial<Record<ErrorCode, string>> = {
  browser_not_found: "Install Chrome or Edge, or set DEBUFF_BROWSER to a Chromium-based browser executable",
  dev_hooks_missing: "Add `if (import.meta.env.DEV) game.use(devTools({ input }))` (from @debuffjp/dev) to src/main.ts",
  port_in_use: "Pass --port <port>, or stop whatever is using that port",
  network: "Check the connection and run the command again",
  unexpected: "Run `npx debuff doctor`. If it passes, this may be a bug in debuff: https://github.com/debuffjp/debuff/issues",
};

const NETWORK = new Set(["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH"]);

/** Turn anything thrown into the report agents read: a stable code, the exit code, a fix and whether to retry. */
export function describeError(err: unknown): ErrorReport {
  const message = err instanceof Error ? err.message : String(err);
  const sys = (err as { code?: unknown } | null)?.code;
  const code: ErrorCode =
    err instanceof DebuffError
      ? err.code
      : (err as { name?: string } | null)?.name === "CACError"
        ? "bad_option"
        : sys === "EADDRINUSE"
          ? "port_in_use"
          : typeof sys === "string" && NETWORK.has(sys)
            ? "network"
            : /No Chromium-based browser|Failed to launch|executable doesn't exist/i.test(message)
              ? "browser_not_found"
              : /__DEBUFF_DEV__ is missing/.test(message)
                ? "dev_hooks_missing"
                : "unexpected";
  const fix = (err instanceof DebuffError ? err.fix : undefined) ?? FIXES[code];
  return { code, message: message.split("\n")[0] ?? message, ...(fix && { fix }), transient: code === "network", exit: EXITS[code] };
}
