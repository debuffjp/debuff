import { spawn } from "node:child_process";
import type { CommandImporter, ImportResult, SourceFile } from "../plugin.js";

const TIMEOUT_MS = 60_000;

/** Run a command importer: SourceFile JSON on stdin, ImportResult JSON on stdout. */
export function runCommandImporter(importer: CommandImporter, file: SourceFile, cwd: string): Promise<ImportResult> {
  const [cmd, ...args] = importer.command;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32" });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`importer "${importer.name}" timed out after ${TIMEOUT_MS / 1000}s on ${file.rel}`));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`importer "${importer.name}" could not start \`${cmd}\`: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(err).toString("utf8").trim();
      if (code !== 0) return reject(new Error(`importer "${importer.name}" exited ${code} on ${file.rel}${stderr ? `: ${stderr}` : ""}`));
      try {
        resolve(JSON.parse(Buffer.concat(out).toString("utf8")) as ImportResult);
      } catch {
        reject(new Error(`importer "${importer.name}" printed invalid JSON for ${file.rel}`));
      }
    });
    child.stdin.end(JSON.stringify(file));
  });
}
