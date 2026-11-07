export interface CreateArgs {
  dir: string | undefined;
  template: string | undefined;
  yes: boolean;
  git: boolean;
  credit: boolean;
}

/** Flags that take the next argument as their value. Every other flag is a switch. */
const VALUE_FLAGS = new Set(["--template"]);

/**
 * Parse `npm create debuff [dir] [options]`. The directory is the first argument that isn't a flag or a value
 * flag's value. Before 0.31.1 any argument after a `--` flag was skipped, so `--yes my-game` lost the directory.
 */
export function parseArgs(args: readonly string[]): CreateArgs {
  let dir: string | undefined;
  let template: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (VALUE_FLAGS.has(a)) {
      if (a === "--template") template = args[i + 1];
      i++;
    } else if (!a.startsWith("-") && dir === undefined) dir = a;
  }
  return {
    dir,
    template,
    yes: args.includes("--yes") || args.includes("-y"),
    git: !args.includes("--no-git"),
    credit: !args.includes("--no-credit"),
  };
}
