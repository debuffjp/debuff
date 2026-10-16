// Bundle the repo's templates into this package before publishing.
import { cpSync, rmSync } from "node:fs";
import { basename } from "node:path";

const skip = new Set(["node_modules", "dist", ".debuff"]);
rmSync("templates", { recursive: true, force: true });
cpSync("../../templates", "templates", { recursive: true, filter: (p) => !skip.has(basename(p)) });
