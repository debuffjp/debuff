import { afterEach, beforeEach, test } from "keiko";

// A beforeEach that throws must still let afterEach clean up, as in Vitest and Jest.
beforeEach(() => {
  throw new Error("setup broke");
});
afterEach(() => {
  console.log("cleaned up");
});

test("never runs its body", () => {
  throw new Error("the body ran");
});
