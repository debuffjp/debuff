# Papercuts

Tooling friction that cost time, so the next person (or agent) skips it. Add an entry when a tool costs you time. Remove it when the cause is fixed.

- **`pkill -f` and `pgrep -f` match the shell running them.** A pattern such as `pkill -f edit.mjs` also matches the `bash -c` command that contains it, so the shell kills itself (exit 144). Match with `ps ax | grep "[e]dit.mjs"`, or run the kill as its own command.
- **`navigator.clipboard` fails over plain HTTP.** A dev server opened through a LAN or Tailscale address isn't a secure context, so `writeText` rejects. Fall back to `document.execCommand("copy")` on a selected textarea, or save through the dev server.
- **Some scripts import `tooling/cli/dist`.** `fonts/sans-draft/build.mjs` and the MCP server load the built CLI, so they fail with a module-not-found error until `npm run build` has run.
