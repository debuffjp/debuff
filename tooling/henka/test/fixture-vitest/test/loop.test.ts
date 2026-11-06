import { expect, test } from "vitest";
import { countTo, half } from "../src/loop";

test("counts up to n", () => {
  expect(countTo(3)).toBe(3);
  expect(countTo(0)).toBe(0);
});

test("halves", () => {
  expect(half(4)).toBe(2);
});
