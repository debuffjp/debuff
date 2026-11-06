import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/args.js";

describe("parseArgs", () => {
  it("finds the directory before, after or between flags", () => {
    expect(parseArgs(["my-game"]).dir).toBe("my-game");
    expect(parseArgs(["--yes", "my-game"]).dir).toBe("my-game");
    expect(parseArgs(["--no-git", "my-game", "--yes"]).dir).toBe("my-game");
    expect(parseArgs(["-y", "my-game"]).dir).toBe("my-game");
    expect(parseArgs(["--color", "my-game"]).dir).toBe("my-game");
  });

  it("reads --template's value, and never takes it for the directory", () => {
    expect(parseArgs(["--template", "platformer", "my-game"])).toMatchObject({ dir: "my-game", template: "platformer" });
    expect(parseArgs(["my-game", "--template", "platformer"])).toMatchObject({ dir: "my-game", template: "platformer" });
    expect(parseArgs(["--template", "platformer"]).dir).toBeUndefined();
  });

  it("reads the boolean flags", () => {
    expect(parseArgs(["-y", "--no-git"])).toMatchObject({ yes: true, git: false });
    expect(parseArgs([])).toMatchObject({ dir: undefined, yes: false, git: true });
  });
});
