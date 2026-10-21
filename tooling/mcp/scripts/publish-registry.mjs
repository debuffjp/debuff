// List (or update) @debuffjp/mcp on the official MCP Registry as jp.debuff/debuff.
// Run from the repo root after the npm release that should be listed (works in PowerShell, cmd or bash):
//   node tooling/mcp/scripts/publish-registry.mjs
// Needs the key in .debuff/mcp-registry/key.pem (its public half is the debuff.jp TXT record) and `gh`.
import { execFileSync } from "node:child_process";
import { createPrivateKey } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { arch, platform } from "node:os";
import { join, resolve } from "node:path";

const dir = resolve(".debuff/mcp-registry");
const key = join(dir, "key.pem");
const pkg = JSON.parse(readFileSync("tooling/mcp/package.json", "utf8"));
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (!existsSync(key)) fail(`Missing ${key} (the debuff.jp DNS key).`);

// 1. The npm release must already carry mcpName: the registry checks it.
let published = "";
try {
  published = execFileSync(`npm view ${pkg.name}@${pkg.version} mcpName`, { encoding: "utf8", shell: true }).trim();
} catch {}
if (published !== pkg.mcpName) fail(`${pkg.name}@${pkg.version} on npm has no mcpName "${pkg.mcpName}" yet: release it to npm first.`);

// 2. mcp-publisher, fetched once from the registry's GitHub releases.
const exe = join(dir, platform() === "win32" ? "mcp-publisher.exe" : "mcp-publisher");
if (!existsSync(exe)) {
  const os = { win32: "windows", darwin: "darwin", linux: "linux" }[platform()];
  const cpu = { x64: "amd64", arm64: "arm64" }[arch()];
  if (!os || !cpu) fail(`No mcp-publisher build for ${platform()}-${arch()}; put one in ${dir}`);
  const asset = `mcp-publisher_${os}_${cpu}.tar.gz`;
  run("gh", ["release", "download", "-R", "modelcontextprotocol/registry", "-p", asset, "-D", dir, "--clobber"]);
  run("tar", ["-xzf", asset], { cwd: dir });
  rmSync(join(dir, asset));
}

// 3. server.json in sync with package.json, sign in with the DNS key, publish.
run(process.execPath, ["tooling/mcp/scripts/server-json.mjs"]);
const jwk = createPrivateKey(readFileSync(key)).export({ format: "jwk" });
const privateKey = Buffer.from(jwk.d, "base64url").toString("hex");
try {
  run(exe, ["login", "dns", "--domain", "debuff.jp", "--private-key", privateKey]);
} catch {
  // Node's error repeats the command line, private key included: report the failure without it.
  // mcp-publisher has already printed why (inherited stdio). "timestamp outside valid window" means this
  // machine's clock is off by more than 15 s: sync it (Windows: Settings > Time > Sync now) and rerun.
  fail("mcp-publisher login failed (see its message above).");
}
run(exe, ["publish"], { cwd: "tooling/mcp" });

const res = await fetch("https://registry.modelcontextprotocol.io/v0.1/servers?search=jp.debuff");
console.log((await res.text()).slice(0, 400));
