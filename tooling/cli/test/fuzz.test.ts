import { describe, expect, it } from "vitest";
import { findLoop } from "../src/fuzz.js";

const flipping = (a: string, b: string) => [a, b, a, b, a];

describe("findLoop", () => {
  it("ignores a single counter rising and falling in normal play", () => {
    const flips = new Map([
      ["state.shots", flipping("1", "2")],
      ["state.time", ["1", "2", "3", "4", "5"]],
    ]);
    expect(findLoop(flips)).toBeUndefined();
  });

  it("reports two fields flipping in step, like a screen and the player's position", () => {
    const flips = new Map([
      ["state.screen", flipping("0", "1")],
      ["state.player", flipping('{"x":10}', '{"x":300}')],
    ]);
    expect(findLoop(flips)?.paths).toEqual(["state.screen", "state.player"]);
  });

  it("reports the scene flipping on its own", () => {
    expect(findLoop(new Map([["scene", flipping('"title"', '"play"')]]))?.paths).toEqual(["scene"]);
  });

  it("needs the last flips to be between the same two values", () => {
    expect(
      findLoop(
        new Map([
          ["scene", ['"a"', '"b"', '"c"', '"a"', '"b"']],
          ["state.x", flipping("1", "2")],
        ]),
      ),
    ).toBeUndefined();
  });
});
