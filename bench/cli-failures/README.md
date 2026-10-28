# How CLIs fail

What does a command-line tool tell a script or a coding agent when it can't do what it was asked? This installs the
current release of 13 JavaScript CLIs (and debuff before and after its failure contract), runs each against small
fixture projects, and records four things the same way for every tool.

```bash
node bench/cli-failures/run.mjs    # about 3 minutes; writes results/<date>-<platform>.json
```

| Check | What it records |
| --- | --- |
| `unknownOption` | `--frobnicate` added to a command that otherwise succeeds: rejected (non-zero exit), or ignored, silently or with a warning |
| `usageVsFailure` | that usage error's exit code against a real failure's (a lint error, a type error, a failing test): distinct or the same |
| `jsonFailure` | with the tool's JSON output on and a real failure: stdout as one parseable document, mixed with other text, written to a file, or empty |
| `jsonCantRun` | with JSON on and a config file that doesn't exist: stdout as JSON (with an error code or not), text, or empty |

The test option isn't `--no-…`, because many parsers read that as turning an option off. Every row keeps the raw
exit codes, the line where the tool named the option, and the start of stdout, so each label can be checked. Tool
versions, Node and npm are recorded with the results.

Caveats: one platform per results file; esbuild on Windows adds a stack trace from its Node launcher that its native
binary on Linux and macOS may not. For npm, "can't run" is a package lookup rather than a missing config file, since
npm treats a missing config as empty. The write-up is
[What a coding agent needs from a CLI failure](https://debuff.jp/research/what-agents-need-from-cli-failures).
