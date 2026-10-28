# Do agents follow the skills?

Every debuff project ships agent skills (`.claude/skills/`, `.agents/skills/`, from `plugins/debuff/skills/`). This
measures whether a coding agent working in a fresh project does what they ask: runs `debuff doctor` when setup
fails, plays the game to check its work instead of reasoning from code, tunes feel through params, runs tests before
saying it's done, and leaves art calls to the human. It runs the same tasks with the skills present and with them
removed, so the difference is what the skills change.

```bash
npm run build                                   # create-debuff's dist and the templates
node bench/skill-eval/run.mjs --runs 3 --judge  # 6 tasks × 2 conditions × 3 runs = 36 agent runs
```

Needs Claude Code (`claude`) signed in, Node 22+, Chrome or Edge, and network access for `npm ci` and the MCP
server. Writes `results/<date>-<model>.json`. Transcripts, diffs and the project copies stay in the work folder
(`--work`, default in the OS temp folder) so any score can be checked by hand.

| Option | Default | |
| --- | --- | --- |
| `--tasks` | all | Comma-separated task ids |
| `--conditions` | `skills,noskills` | Also `bare` (below) |
| `--runs` | 3 | Runs per task and condition |
| `--parallel` | 3 | Agents at once |
| `--model` | `sonnet` | Passed to `claude --model` |
| `--budget` | 4 | USD cap per run (`--max-budget-usd`) |
| `--timeout` | 20 | Minutes per run |
| `--judge` | off | Score the judge items (below) |
| `--rescore <work>` | | Score an earlier run's transcripts again, without running agents |

## How a run works

1. `create-debuff` from this checkout makes a `platformer` project once; `npm install`.
2. Per run: copy it, `npm ci`, apply the condition, break it the way the task says, `git commit` the starting point.
3. `claude -p` gets the task's prompt on stdin, with the project's `.mcp.json` (`--strict-mcp-config`) and
   `--setting-sources project,local`, so user-level plugins and skills stay out and the only debuff skills are the
   project's own. Permissions aren't bypassed: edits are accepted, and `npm`, `npx`, `node`, read-only `git` and a few
   read commands are allowed. Anything else is denied, which shows in the transcript.
4. The scorer reads the `stream-json` transcript and the `git diff`, then a hidden check runs (below).

Conditions:

- `skills`: the project as `create-debuff` makes it.
- `noskills`: both skill folders deleted. `AGENTS.md`, `CLAUDE.md` and the MCP server's instructions stay, and they
  repeat much of the skills, so this measures what the skills add on top of them.
- `bare`: no skills, no `AGENTS.md` or `CLAUDE.md`. Only the MCP server's instructions are left.

## Tasks

The prompts are what a human would type. None names a debuff tool or skill.

| Task | Prompt (shortened) | Rubric (from the transcript) | Hidden check |
| --- | --- | --- | --- |
| `stuck-coin` | the coin counter stops at 11/12 (one coin buried inside a solid block in `level1.tmj`) | played the game before editing `src/` or `assets/`; added a test or scenario; ran tests after the last edit | all 12 coins are present, none is inside a solid tile, and the block is still solid |
| `tune-jump` | the jump feels too low | used `game_params`/`game_set_param`; changed only param defaults, not physics code; played the game before editing; ran tests after editing; **judge:** left the feel call to the human | a held jump rises more than 52 px (template: ~47) |
| `double-jump` | add a double jump and prove it works | wrote a test or scenario; ran tests after the last edit; the new tunable is a param; played the game | a second mid-air press goes higher, a third doesn't |
| `stutter` | it hitches once a second; explain, don't change code | profiled with `game_profile`/`game_frames`; edited nothing | the reply names the cause (a 400k-object rebuild once a second) |
| `broken-setup` | `npm test` fails (`@debuffjp/dev` removed) | ran `debuff doctor`; ran it before its own first fix; ran tests after the fix; didn't delete the dev import | `debuff doctor` and `debuff test` both pass |
| `art-call` | the coins look plain, make them nicer | edited nothing in `src/`; **judge:** proposed options or asked | none |

Runs before 2026-10-28's stuck-coin run used `fall-through` (one-way collision inverted in `src/main.ts`) in its place. That bug was plain from the code, so no run played the game first, with or without skills; the results files still have it.

Shell and MCP routes count the same: `npx debuff test` and `run_tests` are both "ran tests". An item that doesn't
apply (tests after the last edit, when nothing was edited) is left out of that run's score rather than passed.

Two items can't be decided by a rule and go to an LLM judge with `--judge` (`claude -p`, sonnet unless `--judge-model`
says otherwise; one sentence of reasoning then `VERDICT: YES|NO` on the agent's final reply, and the reasoning is kept
in the results). Asked for a bare YES/NO, haiku answered NO to a reply that listed three jump heights and asked which
one to use, so the reasoning step stays: `tune-jump/left-feel-call` and `art-call/offered-options`. Without `--judge`
they're left out. Everything else is a rule in `tasks.mjs` over the tool calls that `score.mjs` extracts.

A run's score is the share of its applicable rubric items it passed. The table gives mean ± standard deviation over
runs per task and condition; the outcome (hidden check) is reported next to it, not mixed in, because a run can
follow every step and still ship a wrong fix, or the reverse.

## Caveats

- Headless `claude -p` has no human to answer, so a run that asks a question and stops is the right behaviour for
  `art-call` and a partial one for the others. The prompts are written so a capable agent can finish without asking.
- The user's own `~/.claude/CLAUDE.md` still loads (`--setting-sources` doesn't cover it). It's the same in both
  conditions; note what it says when comparing machines.
- Small n. Three runs per cell shows direction, not a precise rate; raise `--runs` before quoting a number.
- One agent (Claude Code). Other agents read `.agents/skills/`; adding them means another `agent()` in `run.mjs`.
