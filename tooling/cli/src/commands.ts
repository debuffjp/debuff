/**
 * A small command-line parser, so the CLI needs no dependency for it. It keeps cac's flag syntax
 * (`"-y, --yes"`, `"--root <dir>"`), which plugins use for their own commands: `<value>` takes a value,
 * no brackets is a boolean flag, names become camelCase, numbers become numbers, and `[dir]` and
 * `[...files]` are positional arguments.
 */
import { DebuffError } from "./errors.js";

interface OptionDef {
  /** camelCase name. */
  name: string;
  /** Single-letter alias, without the dash. */
  short: string | undefined;
  takesValue: boolean;
  flags: string;
  description: string;
  default: unknown;
}

type Action = (...args: never[]) => unknown;

export class Command {
  readonly name: string;
  readonly options: OptionDef[] = [];
  /** Positional arguments: `rest` collects the remainder into an array. */
  readonly positionals: { name: string; rest: boolean }[] = [];
  handler: Action | undefined;

  constructor(
    readonly spec: string,
    readonly description: string,
  ) {
    const [name = "", ...args] = spec.split(/\s+/);
    this.name = name;
    for (const a of args) {
      const m = /^[[<](\.\.\.)?([^\]>]+)[\]>]$/.exec(a);
      if (m) this.positionals.push({ name: m[2] ?? a, rest: Boolean(m[1]) });
    }
  }

  option(flags: string, description: string, config?: { default?: unknown }): this {
    const longs = [...flags.matchAll(/--([\w-]+)/g)].map((m) => m[1] ?? "");
    const short = /(?:^|[\s,])-(\w)\b/.exec(flags)?.[1];
    this.options.push({
      name: camel(longs[0] ?? short ?? flags),
      short,
      takesValue: /<[^>]+>|\[[^\]]+\]/.test(flags),
      flags,
      description,
      default: config?.default,
    });
    return this;
  }

  action(fn: Action): this {
    this.handler = fn;
    return this;
  }
}

export class Cli {
  readonly commands: Command[] = [];
  /** Global flags seen by `parse`: `help` and `version`. */
  options: { help?: boolean; version?: boolean } = {};
  matchedCommand: Command | undefined;
  private versionText = "";
  private parsed: { args: unknown[]; options: Record<string, unknown> } | undefined;

  constructor(readonly name: string) {}

  command(spec: string, description: string): Command {
    const cmd = new Command(spec, description);
    this.commands.push(cmd);
    return cmd;
  }

  version(text: string): this {
    this.versionText = text;
    return this;
  }

  /** Match a command and read its arguments. Prints help or the version for `-h`/`-v` and stops there. */
  parse(argv: string[]): void {
    const tokens = argv.slice(2);
    const name = tokens.find((t) => !t.startsWith("-"));
    const cmd = name === undefined ? undefined : this.commands.find((c) => c.name === name);
    const rest = cmd ? tokens.filter((t, i) => !(t === name && i === tokens.indexOf(name))) : tokens;
    const known = cmd?.options ?? [];
    const options: Record<string, unknown> = {};
    const positional: string[] = [];
    const unknown: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      const t = rest[i] as string;
      if (t === "--") {
        positional.push(...rest.slice(i + 1));
        break;
      }
      // Undeclared options take a following value, as with cac; declared ones only when they have <value>.
      if (t.startsWith("-") && t !== "-") {
        const long = t.startsWith("--");
        const [rawName = "", inline] = t.replace(/^--?/, "").split(/=(.*)/s, 2);
        const def = long ? known.find((o) => o.name === camel(rawName)) : known.find((o) => o.short === rawName);
        const key = def?.name ?? camel(rawName === "h" ? "help" : rawName === "v" ? "version" : rawName);
        if (!def && key !== "help" && key !== "version") unknown.push(t.split("=")[0] as string);
        if (inline !== undefined) options[key] = coerce(inline);
        else if (
          (def ? def.takesValue : key !== "help" && key !== "version") &&
          i + 1 < rest.length &&
          !(rest[i + 1] as string).startsWith("-")
        )
          options[key] = coerce(rest[++i] as string);
        else options[key] = true;
      } else positional.push(t);
    }
    for (const o of known) if (options[o.name] === undefined && o.default !== undefined) options[o.name] = o.default;
    this.options = { help: options.help === true, version: options.version === true };
    if (this.options.help) {
      this.outputHelp(cmd);
      return;
    }
    if (this.options.version && !cmd) {
      console.log(`${this.name}/${this.versionText}`);
      return;
    }
    this.matchedCommand = cmd;
    if (!cmd) return;
    if (unknown.length)
      throw new DebuffError(
        "bad_option",
        `Unknown option${unknown.length > 1 ? "s" : ""} for ${this.name} ${cmd.name}: ${unknown.join(", ")}`,
        `Run \`npx ${this.name} ${cmd.name} --help\` for its options`,
      );
    const args: unknown[] = cmd.positionals.map((p, i) => (p.rest ? positional.slice(i) : positional[i]));
    this.parsed = { args, options };
  }

  /** Run the matched command's action with its positional arguments, then its options. */
  async runMatchedCommand(): Promise<unknown> {
    if (!this.matchedCommand?.handler || !this.parsed) return undefined;
    return (this.matchedCommand.handler as (...a: unknown[]) => unknown)(...this.parsed.args, this.parsed.options);
  }

  outputHelp(cmd?: Command): void {
    const lines = [`${this.name}/${this.versionText}`, ""];
    if (cmd) {
      lines.push("Usage:", `  $ ${this.name} ${cmd.spec}`, "", cmd.description, "");
      const rows = [...cmd.options.map((o) => [o.flags, describe(o)]), ["-h, --help", "Display this message"]];
      lines.push("Options:", ...table(rows));
    } else {
      lines.push(
        "Usage:",
        `  $ ${this.name} <command> [options]`,
        "",
        "Commands:",
        ...table(this.commands.map((c) => [c.spec, c.description])),
      );
      lines.push("", "For more info, run any command with the `--help` flag:");
      for (const c of this.commands.slice(0, 3)) lines.push(`  $ ${this.name} ${c.name} --help`);
      lines.push(
        "",
        "Options:",
        ...table([
          ["-h, --help", "Display this message"],
          ["-v, --version", "Display version number"],
        ]),
      );
    }
    console.log(lines.join("\n"));
  }
}

function describe(o: OptionDef): string {
  return o.default === undefined ? o.description : `${o.description} (default: ${String(o.default)})`;
}

function table(rows: string[][]): string[] {
  const w = Math.max(0, ...rows.map((r) => (r[0] ?? "").length));
  return rows.map(([a = "", b = ""]) => `  ${a.padEnd(w)}  ${b}`);
}

/** `max-steps` → `maxSteps`. */
function camel(name: string): string {
  return name.replace(/-+([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Numbers become numbers, as with cac; everything else stays a string. */
function coerce(value: string): string | number {
  return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}
