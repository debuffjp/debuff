import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

/** One type error, with `file` relative to the project root (forward slashes) and 1-based line and column. */
export interface TypeDiagnostic {
  file: string;
  line: number;
  column: number;
  /** The TypeScript error code, e.g. 2322. */
  code: number;
  message: string;
}

export interface TypeCheckResult {
  /** False when the project has no tsconfig.json or no `typescript` installed; `reason` says which. */
  ok: boolean;
  reason?: string;
  diagnostics: TypeDiagnostic[];
  ms: number;
}

/** Where the project's own `tsc` lives, or undefined if `typescript` isn't installed. */
function findTsc(root: string): string | undefined {
  try {
    const pkg = createRequire(join(root, "package.json")).resolve("typescript/package.json");
    const bin = join(dirname(pkg), "bin", "tsc");
    return existsSync(bin) ? bin : undefined;
  } catch {
    return undefined;
  }
}

const LINE = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/;

/** Parse `tsc --pretty false` output. Indented lines continue the previous message. */
export function parseTscOutput(output: string, root: string): TypeDiagnostic[] {
  const out: TypeDiagnostic[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (m) {
      const [, file = "", line = "0", column = "0", code = "0", message = ""] = m;
      const rel = relative(root, join(root, file)).replaceAll("\\", "/");
      out.push({ file: rel, line: Number(line), column: Number(column), code: Number(code), message });
    } else if (/^\s+\S/.test(raw) && out.length) {
      const last = out[out.length - 1];
      if (last) last.message += `\n${raw.trim()}`;
    }
  }
  return out;
}

/**
 * Type-check the project with its own `tsc --noEmit` (the version in its node_modules, so results match
 * `npm run check`). Never throws for type errors: they come back as diagnostics.
 */
export function typecheck(root: string): Promise<TypeCheckResult> {
  const start = performance.now();
  const done = (r: Omit<TypeCheckResult, "ms">): TypeCheckResult => ({ ...r, ms: Math.round(performance.now() - start) });
  if (!existsSync(join(root, "tsconfig.json"))) return Promise.resolve(done({ ok: false, reason: "no tsconfig.json", diagnostics: [] }));
  const tsc = findTsc(root);
  if (!tsc) return Promise.resolve(done({ ok: false, reason: "typescript is not installed", diagnostics: [] }));
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [tsc, "--noEmit", "-p", root, "--pretty", "false"],
      { cwd: root, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        const diagnostics = parseTscOutput(stdout, root);
        // tsc exits non-zero for type errors; only treat it as a failure if it printed none.
        if (err && !diagnostics.length && !stdout.trim()) {
          resolve(done({ ok: false, reason: `tsc failed: ${err.message}`, diagnostics }));
        } else resolve(done({ ok: true, diagnostics }));
      },
    );
  });
}

/**
 * Re-checks after changes: debounced, one run at a time, and a change during a run queues exactly one more.
 * `onResult` gets every finished run.
 */
export function createTypeChecker(root: string, onResult: (r: TypeCheckResult) => void, delayMs = 150) {
  let running = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: TypeCheckResult | undefined;
  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    do {
      again = false;
      latest = await typecheck(root);
      onResult(latest);
    } while (again);
    running = false;
  };
  return {
    /** Ask for a check soon (debounced). */
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    },
    /** The last finished result, if any. */
    get latest() {
      return latest;
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}
