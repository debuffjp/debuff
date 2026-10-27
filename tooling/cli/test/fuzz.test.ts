import { describe, expect, it } from "vitest";
import { findLoop, fuzzGesture } from "../src/fuzz.js";

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

describe("fuzzGesture", () => {
  const seq = (...values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length] ?? 0;
  };

  it("scrolls the wheel either way", () => {
    expect(fuzzGesture("Wheel", seq(0, 0.9, 0), 320, 180)).toEqual([{ wheel: 40 }, { wait: 1 }]);
    expect(fuzzGesture("Wheel", seq(1, 0.1, 0), 320, 180)[0]).toEqual({ wheel: -400 });
  });

  it("taps a finger inside the game, or drags it to another point", () => {
    expect(fuzzGesture("Touch", seq(0.5, 0.5, 0, 0.9, 0), 320, 180)).toEqual([
      { touchDown: [1, 160, 90] },
      { wait: 1 },
      { touchUp: 1 },
      { wait: 1 },
    ]);
    const drag = fuzzGesture("Touch", seq(0, 0, 0, 0.1, 1, 1, 0), 320, 180);
    expect(drag.filter((s) => "touchMove" in s).at(-1)).toEqual({ touchMove: [1, 320, 180] });
    expect(drag.at(-2)).toEqual({ touchUp: 1 });
  });
});
