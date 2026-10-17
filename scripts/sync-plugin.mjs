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
const lock = read(`${plugin}/package-lock.json`);
// Done only when the lockfile resolves the new version too: a run that failed halfway can be rerun.
if (pkg.dependencies["@debuffjp/mcp"] === version && lock.packages?.["node_modules/@debuffjp/mcp"]?.version === version) {
  console.log(`plugin already uses @debuffjp/mcp@${version}`);
  process.exit(0);
}

// npm can take a few minutes to serve a new version (longer if it's staged for approval). Wait for it.
const published = () => {
  try {
    return (
      execSync(`npm view @debuffjp/mcp@${version} version`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === version
    );
  } catch {
    return false;
  }
};
for (let tries = 0; !published(); tries++) {
  if (tries === 30) {
    console.error(
      `@debuffjp/mcp@${version} still isn't on npm after 5 minutes. If it's staged, approve it on npmjs.com, then run: node scripts/sync-plugin.mjs && git push origin main --tags`,
    );
    process.exit(1);
  }
  if (tries === 0) console.log(`waiting for npm to serve @debuffjp/mcp@${version}…`);
  execSync(process.platform === "win32" ? "timeout /t 10 /nobreak >nul" : "sleep 10", { stdio: "ignore", shell: true });
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
