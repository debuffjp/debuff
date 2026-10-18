import pc from "./ansi.js";
import type { TestReport, TestResult } from "./runner.js";
import { show } from "./values.js";

/** debuff lime, when the terminal supports colour. */
const lime = (s: string) => (pc.isColorSupported ? `\x1b[38;2;207;251;45m${s}\x1b[39m` : s);
const amber = (s: string) => (pc.isColorSupported ? `\x1b[38;2;251;191;36m${s}\x1b[39m` : s);

/** One test as terminal text: a status line, plus the failure, the game's state and any logs when it failed. */
export function formatResult(r: TestResult): string {
  const name = `${pc.dim(`${r.file} ›`)} ${r.suites.length ? `${r.suites.join(" › ")} › ` : ""}${pc.bold(r.name)}`;
  if (r.status === "skip") return `${pc.dim("skip")} ${name}`;
  if (r.status === "todo") return `${amber("todo")} ${name}`;
  if (r.status === "pass") return `${lime("pass")} ${name} ${pc.dim(`${r.durationMs} ms`)}`;
  const e = r.error;
  const lines = [`${pc.red("fail")} ${name} ${pc.dim(`${r.durationMs} ms`)}`];
  if (e) {
    lines.push(`  ${pc.red(e.kind === "Error" ? "" : `${e.kind}: `)}${e.message}`);
    if (e.where) lines.push(`  ${pc.dim("at")} ${e.where}`);
    if (e.game) {
      const time = `${e.game.time.toFixed(2)}s`;
      lines.push(`  ${pc.dim("game")} tick ${e.game.tick} (${time})${e.game.scene ? ` · scene ${e.game.scene}` : ""}`);
      lines.push(`  ${pc.dim("state")} ${show(e.game.state, 300)}`);
    }
  }
  if (r.logs.length) {
    lines.push(`  ${pc.dim("console")}`);
    for (const l of r.logs.slice(-20)) lines.push(`    ${pc.dim(l)}`);
    if (r.logs.length > 20) lines.push(`    ${pc.dim(`…and ${r.logs.length - 20} earlier lines`)}`);
  }
  return lines.join("\n");
}

/** `12 passed · 1 failed · 2 skipped in 840 ms`. */
export function formatSummary(report: TestReport): string {
  const parts = [`${report.passed} passed`];
  if (report.failed) parts.push(pc.red(`${report.failed} failed`));
  if (report.skipped) parts.push(`${report.skipped} skipped`);
  if (report.todo) parts.push(`${report.todo} todo`);
  const outside = report.outside
    .map((e) => `\n${pc.red("✖")} outside any test: ${e.message}${e.where ? pc.dim(` (${e.where})`) : ""}`)
    .join("");
  return `${parts.join(" · ")} in ${report.durationMs} ms${outside}`;
}
