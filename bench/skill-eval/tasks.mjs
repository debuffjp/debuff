// The fixed tasks. Each runs in a fresh copy of the platformer template made by create-debuff.
//
//   setup(dir)   breaks the project the way the prompt describes, before the agent starts
//   prompt       what a human would type; it never names a debuff tool or skill
//   rubric       behaviours the skills ask for, scored from the transcript (see score.mjs)
//   outcome      a hidden check run after the agent finishes: did the change actually work?
//
// Rubric items marked `judge` can't be decided by a rule and go to an LLM judge (run.mjs --judge).
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diffLines, first, is, last, some } from "./score.mjs";

function replace(dir, file, from, to) {
  const path = join(dir, file);
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`setup: "${from}" not found in ${file}`);
  writeFileSync(path, text.replace(from, to));
}

const editedAnything = (r) => some(r.actions, (a) => a.file !== undefined);
/** Tests or scenarios ran after the last code change; null when the agent changed no code. */
const verifiedAfterEdits = (r) => {
  const edit = last(r.actions, (a) => is.editSrc(a) || is.editTests(a) || is.editPackage(a));
  if (edit === Number.NEGATIVE_INFINITY) return null;
  return last(r.actions, (a) => is.tests(a) || is.scenarios(a)) > edit;
};
const playedBeforeEditing = (r) => first(r.actions, is.played) < first(r.actions, is.editSrc);
const srcDiff = (r) =>
  diffLines(
    r.diff
      .split(/^diff --git /m)
      .filter((d) => d.includes("src/"))
      .join("\n"),
  );

export const TASKS = [
  {
    id: "fall-through",
    title: "Fix a bug: the player falls through one-way platforms",
    setup: (dir) => replace(dir, "src/main.ts", 'dropThrough: input.down("down")', 'dropThrough: !input.down("down")'),
    prompt: "Players report that buff falls straight through the thin floating platforms instead of landing on them. Please fix it.",
    rubric: [
      {
        id: "reproduced-first",
        desc: "Ran the game (MCP game tools, a test or a scenario) before editing src/",
        check: playedBeforeEditing,
      },
      { id: "regression-test", desc: "Added or changed a test or scenario", check: (r) => some(r.actions, is.editTests) },
      { id: "verified", desc: "Ran tests or scenarios after the last edit", check: verifiedAfterEdits },
    ],
    hidden: "fall-through.test.ts",
  },
  {
    id: "tune-jump",
    title: "Tune feel: make the jump higher",
    prompt: "The jump feels too low. Make buff jump higher.",
    rubric: [
      { id: "used-params", desc: "Read or set params through game_params / game_set_param", check: (r) => some(r.actions, is.params) },
      {
        id: "params-not-physics",
        desc: "Every changed line in src/ is a param default, not physics code",
        check: (r) => {
          const { added, removed } = srcDiff(r);
          if (!added.length && !removed.length) return null;
          return [...added, ...removed].every((l) => !l.trim() || /^\s*\w+:\s*\{\s*type:\s*"number",\s*default:/.test(l));
        },
      },
      {
        id: "measured",
        desc: "Ran the game to measure the jump before changing src/ (MCP game tools, a test or a scenario)",
        check: playedBeforeEditing,
      },
      { id: "verified", desc: "Ran tests or scenarios after the last edit", check: verifiedAfterEdits },
      {
        id: "left-feel-call",
        judge: true,
        desc: "The final reply leaves the feel decision to the human (numbers, options, or a question) instead of presenting one value as settled",
      },
    ],
    hidden: "tune-jump.test.ts",
  },
  {
    id: "double-jump",
    title: "Add a mechanic and prove it works",
    prompt: "Add a double jump: buff can jump once more in mid-air. Prove it works.",
    rubric: [
      { id: "test-written", desc: "Added or changed a test or scenario", check: (r) => some(r.actions, is.editTests) },
      { id: "verified", desc: "Ran tests or scenarios after the last edit", check: verifiedAfterEdits },
      {
        id: "tunable-param",
        desc: "The new tunable is a param (a line added inside game.params.define)",
        check: (r) => srcDiff(r).added.some((l) => /^\s*\w+:\s*\{\s*type:\s*"(number|boolean)"/.test(l)),
      },
      { id: "played", desc: "Ran the game (MCP game tools, a test or a scenario)", check: (r) => some(r.actions, is.played) },
    ],
    hidden: "double-jump.test.ts",
  },
  {
    id: "stutter",
    title: "Explain a stutter",
    setup: (dir) => {
      replace(
        dir,
        "src/main.ts",
        "// ---- scene ----",
        `let sparkleTimer = 0;
let sparkles: { x: number; y: number; life: number }[] = [];
/** Re-seed the background sparkles. */
function refreshSparkles(): void {
  sparkles = [];
  for (let i = 0; i < 400_000; i++) sparkles.push({ x: Math.random() * 320, y: Math.random() * 180, life: Math.random() });
  sparkles.sort((a, b) => a.life - b.life);
  sparkles.length = 40;
}

// ---- scene ----`,
      );
      replace(
        dir,
        "src/main.ts",
        "    tweens.update(dt);\n",
        "    sparkleTimer += dt;\n    if (sparkleTimer > 1) {\n      sparkleTimer = 0;\n      refreshSparkles();\n    }\n    tweens.update(dt);\n",
      );
    },
    prompt: "The game hitches about once a second while it runs. Find out why and tell me what's causing it. Don't change any code yet.",
    rubric: [
      {
        id: "profiled",
        desc: "Measured frame times (game_profile / game_frames) before answering",
        check: (r) => some(r.actions, is.profiled),
      },
      { id: "no-edits", desc: "Changed no files, as asked", check: (r) => !editedAnything(r) },
    ],
    outcome: (r) => /refreshSparkles|sparkle/i.test(r.final),
  },
  {
    id: "broken-setup",
    title: "Set up a broken project",
    setup: (dir) => {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      delete pkg.devDependencies["@debuffjp/dev"];
      writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
      rmSync(join(dir, "node_modules", "@debuffjp", "dev"), { recursive: true, force: true });
    },
    prompt: "`npm test` fails in this project and I don't know why. Get it working.",
    rubric: [
      { id: "doctor", desc: "Ran debuff doctor (CLI or MCP)", check: (r) => some(r.actions, is.doctor) },
      {
        id: "doctor-first",
        desc: "Ran doctor before its own first fix (an install or a package.json edit)",
        check: (r) => first(r.actions, is.doctor) < first(r.actions, (a) => is.install(a) || is.editPackage(a)),
      },
      {
        id: "verified",
        desc: "Ran tests or scenarios after the last fix",
        check: (r) => {
          const fix = last(r.actions, (a) => is.install(a) || is.editPackage(a) || is.editSrc(a));
          const test = last(r.actions, (a) => is.tests(a) || is.scenarios(a));
          // `npm i -D … ; npm test` in one command: the test still ran after the fix.
          return (
            test > fix ||
            (test === fix &&
              /\b(npm|pnpm|yarn)\s+(i|install|ci|add)\b[\s\S]*\b(debuff(\.js)?\s+(test|scenario)|npm\s+(run\s+)?test)\b/.test(
                r.actions[test].cmd ?? "",
              ))
          );
        },
      },
      {
        id: "kept-dev-import",
        desc: "Didn't fix it by deleting the dev tools from src/",
        check: (r) => !srcDiff(r).removed.some((l) => l.includes("@debuffjp/dev")),
      },
    ],
    outcome: "doctor+tests",
  },
  {
    id: "art-call",
    title: "Don't make art calls",
    prompt: "The coins look a bit plain. Make them look nicer.",
    rubric: [
      {
        id: "no-art-edit",
        desc: "Didn't change how the game looks (no edits in src/) without the human choosing",
        check: (r) => !some(r.actions, is.editSrc),
      },
      { id: "offered-options", judge: true, desc: "The final reply proposes options or asks the human to choose" },
    ],
  },
];
