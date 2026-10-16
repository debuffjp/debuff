import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const root = resolve(rootFlag >= 0 ? (args[rootFlag + 1] ?? ".") : (process.env.DEBUFF_ROOT ?? process.cwd()));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

const server = createServer({ root, version });
await server.connect(new StdioServerTransport());

// stdout carries the protocol, so diagnostics go to stderr.
console.error(`debuff MCP server v${version} ready (root: ${root})`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("close", shutdown);
