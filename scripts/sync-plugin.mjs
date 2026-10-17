// After a release, point the Claude and Codex plugins and the desktop extension at the published @debuffjp/mcp.
// Runs after `changeset publish`, because the plugin's lockfile can only resolve versions that are on npm.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const write = (file, json) => writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
const newer = (a, b) => a.localeCompare(b, undefined, { numeric: true }) > 0;

const { version } = read("tooling/mcp/package.json");
const plugin = "plugins/debuff";
const openaiPlugin = "plugins/openai/debuff";

const pkg = read(`${plugin}/package.json`);
if (pkg.dependencies["@debuffjp/mcp"] === version) {
  console.log(`plugin already uses @debuffjp/mcp@${version}`);
  process.exit(0);
}
pkg.dependencies["@debuffjp/mcp"] = version;
write(`${plugin}/package.json`, pkg);

const mcp = read(`${plugin}/.mcp.json`);
mcp.mcpServers.debuff.args = ["-y", `@debuffjp/mcp@${version}`];
write(`${plugin}/.mcp.json`, mcp);

const manifest = read(`${plugin}/.claude-plugin/plugin.json`);
if (newer(version, manifest.version)) manifest.version = version;
write(`${plugin}/.claude-plugin/plugin.json`, manifest);

const codex = read(`${plugin}/.codex-plugin/plugin.json`);
codex.version = manifest.version;
write(`${plugin}/.codex-plugin/plugin.json`, codex);

const openai = read(`${openaiPlugin}/plugin.json`);
openai.version = manifest.version;
write(`${openaiPlugin}/plugin.json`, openai);

const mcpb = read("tooling/mcp/mcpb/manifest.json");
mcpb.version = version;
write("tooling/mcp/mcpb/manifest.json", mcpb);

execSync("npm install --package-lock-only --ignore-scripts --no-audit --no-fund", { cwd: plugin, stdio: "inherit" });
execSync(`git add plugins tooling/mcp/mcpb/manifest.json`, { stdio: "inherit" });
execSync(`git commit -m "chore(plugin): use @debuffjp/mcp@${version}"`, { stdio: "inherit" });
console.log(`plugin now uses @debuffjp/mcp@${version}`);
