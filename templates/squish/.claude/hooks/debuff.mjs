// debuff's checks on an agent's edits and commands: https://debuff.jp/docs/agents#hook
// DEBUFF_HOOK=0 turns them off. Rules live in the installed @debuffjp/cli, so they follow the project's debuff version.
try {
  const { run } = await import("@debuffjp/cli/hook");
  run(process.argv.slice(2));
} catch {}
