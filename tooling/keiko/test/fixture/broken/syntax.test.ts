import { test } from "keiko";

throw new Error("this file can't even load");

// biome-ignore lint/correctness/noUnreachable: the file exists to fail while loading.
test("never registered", () => {});
