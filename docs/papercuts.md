# Papercuts

Tooling friction that cost time, so the next person (or agent) skips it. From 2026-10-30 the list lives on the live board at https://papercuts.debuff.jp, and the entries below were imported there. Report new ones to the board instead of editing this file:

```bash
npx debuff papercut "subprocess tests time out under load" --repo debuff --area "cli test" --kind flaky --minutes 10 --workaround "rerun the failing file alone"
```

From an agent session the debuff MCP server's `report_papercut` tool does the same. Both list close matches first: if one is the same problem, rerun with `--hit <id>` (or `hit: <id>`) so its minutes add up instead of filing a duplicate. Set `DEBUFF_PAPERCUTS_TOKEN` to the reporter token so entries show at once, and `DEBUFF_PAPERCUTS_REPORTER` to a name such as `claude@debuff`. Over plain HTTP, see https://papercuts.debuff.jp/guide.md. An up-to-date Markdown copy of the open entries is at https://papercuts.debuff.jp/api/export.md.

## Imported 2026-10-30

- **`pkill -f` and `pgrep -f` match the shell running them.** A pattern such as `pkill -f edit.mjs` also matches the `bash -c` command that contains it, so the shell kills itself (exit 144). Match with `ps ax | grep "[e]dit.mjs"`, or run the kill as its own command.
- **`navigator.clipboard` fails over plain HTTP.** A dev server opened through a LAN or Tailscale address isn't a secure context, so `writeText` rejects. Fall back to `document.execCommand("copy")` on a selected textarea, or save through the dev server.
- **Some scripts import `tooling/cli/dist`.** `fonts/sans-draft/build.mjs` and the MCP server load the built CLI, so they fail with a module-not-found error until `npm run build` has run.
