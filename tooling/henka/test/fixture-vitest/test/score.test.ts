import { expect, test } from "vitest";
import { combo, isHighScore } from "../src/score";

test("combo multiplies from three hits", () => {
  expect(combo(1)).toBe(1);
  expect(combo(4)).toBe(8);
});

test("a higher score beats the best", () => {
  expect(isHighScore(10, 5)).toBe(true);
  expect(isHighScore(5, 10)).toBe(false);
});
