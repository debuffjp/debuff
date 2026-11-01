// Papercut #20: now and then a Node process in `npm run check` dies with Windows exit 0xC0000409 (a fast-fail
// abort) and doesn't happen again on a re-run. Until it can be reproduced, keep the evidence when it does.
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, freemem, totalmem } from "node:os";
import { join, resolve } from "node:path";

const CRASH = /3221226505|0xC0000409|STATUS_STACK_BUFFER_OVERRUN/i;

/** Whether `text` (a log, or an exit code as a string) shows the crash. */
export const isCrash = (text) => CRASH.test(String(text));

/** Saves `text` with the machine's state to .debuff/crashes/ and returns the file's path. */
export function saveCrash(label, text) {
  const dir = resolve(import.meta.dirname, "..", ".debuff", "crashes");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${label.replace(/[^\w-]+/g, "_")}.log`);
  const gb = (n) => (n / 2 ** 30).toFixed(1);
  const header = [
    `crash: ${label}`,
    `node ${process.version} ${process.platform} ${process.arch}, ${cpus().length} cpus`,
    `memory free ${gb(freemem())} of ${gb(totalmem())} GB`,
    "Add a hit to papercut #20 with this file's contents.",
  ];
  writeFileSync(file, `${header.join("\n")}\n\n${text}`);
  return file;
}
