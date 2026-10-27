// Bundle the plugin's agent skills into this package before publishing, so `npm create debuff` and
// `debuff doctor --fix` write skills that match this release (see src/skills.ts).
import { cpSync, rmSync } from "node:fs";

rmSync("skills", { recursive: true, force: true });
cpSync("../../plugins/debuff/skills", "skills", { recursive: true });
console.log("bundled skills");
