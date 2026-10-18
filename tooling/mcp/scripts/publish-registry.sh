#!/usr/bin/env bash
# List (or update) @debuffjp/mcp on the official MCP Registry as jp.debuff/debuff.
# Run from the repo root in Git Bash, after the npm release that should be listed:
#   bash tooling/mcp/scripts/publish-registry.sh
# Needs: the key in .debuff/mcp-registry/key.pem (its public half is the debuff.jp TXT record) and gh.
set -euo pipefail

dir=".debuff/mcp-registry"
key="$dir/key.pem"
[ -f "$key" ] || { echo "Missing $key (the debuff.jp DNS key)."; exit 1; }

# mcp-publisher, fetched once from the registry's GitHub releases.
publisher="$dir/mcp-publisher"
[ -f "$publisher.exe" ] && publisher="$publisher.exe"
if ! [ -x "$publisher" ]; then
  case "$(uname -s)-$(uname -m)" in
    MINGW*-x86_64 | MSYS*-x86_64) asset="mcp-publisher_windows_amd64.tar.gz" ;;
    MINGW*-aarch64 | MSYS*-aarch64) asset="mcp-publisher_windows_arm64.tar.gz" ;;
    Darwin-arm64) asset="mcp-publisher_darwin_arm64.tar.gz" ;;
    Darwin-x86_64) asset="mcp-publisher_darwin_amd64.tar.gz" ;;
    Linux-x86_64) asset="mcp-publisher_linux_amd64.tar.gz" ;;
    *) echo "Unknown platform; install mcp-publisher yourself into $dir"; exit 1 ;;
  esac
  gh release download -R modelcontextprotocol/registry -p "$asset" -D "$dir" --clobber
  tar -xzf "$dir/$asset" -C "$dir"
  rm "$dir/$asset"
  publisher="$dir/mcp-publisher"
  [ -f "$publisher.exe" ] && publisher="$publisher.exe"
fi

npm view "@debuffjp/mcp@$(node -p "require('./tooling/mcp/package.json').version")" mcpName | grep -q jp.debuff/debuff ||
  { echo "The published @debuffjp/mcp at this version has no mcpName yet: release it to npm first."; exit 1; }

node tooling/mcp/scripts/server-json.mjs
private="$(openssl pkey -in "$key" -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
"$publisher" login dns --domain debuff.jp --private-key "$private"
(cd tooling/mcp && "../../$publisher" publish)
curl -s "https://registry.modelcontextprotocol.io/v0.1/servers?search=jp.debuff" | head -c 400
echo
