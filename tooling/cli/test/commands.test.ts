import { afterEach, describe, expect, it, vi } from "vitest";
import { Cli } from "../src/commands.js";

const argv = (...a: string[]) => ["node", "debuff", ...a];

describe("Cli", () => {
  afterEach(() => vi.restoreAllMocks());

  function make() {
    const cli = new Cli("debuff").version("1.2.3");
    const seen: unknown[][] = [];
    cli
      .command("create [dir]", "Scaffold")
      .option("--template <id>", "Template")
      .option("-y, --yes", "Defaults")
      .action((...a: unknown[]) => seen.push(a));
    cli
      .command("fuzz", "Fuzz")
      .option("--seconds <n>", "Seconds", { default: 60 })
      .option("--max-steps <n>", "Steps")
      .option("--json", "JSON")
      .action((...a: unknown[]) => seen.push(a));
    cli.command("scenario [...files]", "Scenarios").action((...a: unknown[]) => seen.push(a));
    return { cli, seen };
  }

  it("matches commands, positionals, values, booleans, short aliases, defaults and numbers", async () => {
    const { cli, seen } = make();
    cli.parse(argv("create", "my-game", "--template", "platformer", "-y"));
    await cli.runMatchedCommand();
    expect(seen.at(-1)).toEqual(["my-game", { template: "platformer", yes: true }]);
    cli.parse(argv("fuzz", "--max-steps=30", "--json"));
    await cli.runMatchedCommand();
    expect(seen.at(-1)).toEqual([{ maxSteps: 30, json: true, seconds: 60 }]);
    cli.parse(argv("scenario", "a.json", "b.json", "--root", "x"));
    await cli.runMatchedCommand();
    expect(seen.at(-1)).toEqual([["a.json", "b.json"], { root: "x" }]);
  });

  it("prints help and the version, and leaves unknown commands unmatched", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { cli } = make();
    cli.parse(argv("--help"));
    expect(cli.matchedCommand).toBeUndefined();
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/Commands:[\s\S]*create \[dir\]\s+Scaffold/);
    cli.parse(argv("fuzz", "--help"));
    expect(log.mock.calls.at(-1)?.[0]).toMatch(/--seconds <n>\s+Seconds \(default: 60\)/);
    cli.parse(argv("--help", "fuzz"));
    expect(cli.options.help).toBe(true);
    cli.parse(argv("-v"));
    expect(log.mock.calls.at(-1)?.[0]).toBe("debuff/1.2.3");
    cli.parse(argv("nope"));
    expect(cli.matchedCommand).toBeUndefined();
  });
});
