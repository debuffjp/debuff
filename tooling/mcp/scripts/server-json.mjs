// Writes server.json for the official MCP Registry from package.json, so the listed version always matches
// the npm release. Run after publishing to npm, then `mcp-publisher publish` (see docs/releasing.md).
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const server = {
  $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  name: pkg.mcpName,
  title: "debuff",
  description: "Let coding agents play, test and tune your 2D web game: live state, explained errors, replays, fuzz.",
  websiteUrl: "https://debuff.jp/docs/agents",
  repository: { url: "https://github.com/debuffjp/debuff", source: "github", subfolder: "tooling/mcp" },
  version: pkg.version,
  packages: [{ registryType: "npm", identifier: pkg.name, version: pkg.version, transport: { type: "stdio" } }],
};
if (server.description.length > 100) throw new Error(`description is ${server.description.length} characters; the registry allows 100`);
writeFileSync(new URL("../server.json", import.meta.url), `${JSON.stringify(server, null, 2)}\n`);
console.log(`server.json: ${server.name} ${server.version}`);
