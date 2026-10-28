// Checks docs, comments and commit messages for the writing patterns in AGENTS.md that a regular expression can find.
// Usage: node scripts/lint-prose.mjs            (every tracked .md, .ts, .mjs and package.json)
//        node scripts/lint-prose.mjs --message <file>   (one commit message, from the commit-msg hook)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Each rule is a pattern and the reason shown when it matches. Add a rule here and a line in AGENTS.md together. */
export const RULES = [
  [/—/, "em dash: use a colon, a comma, parentheses or a new sentence"],
  [
    /\b(delve|crucial|leverag(e|es|ed|ing)|seamless(ly)?|robust|utili[sz]e|comprehensive|furthermore|moreover|plethora|tapestry|streamline|holistic|synergy|effortless(ly)?|supercharge|cutting-edge|state-of-the-art|game-changer)\b/i,
    "AI vocabulary: say the specific thing",
  ],
  [/\b(it's|it is) worth noting\b|\bat its core\b|\bdeep dive\b|\bdive into\b|\brest assured\b/i, "filler phrase: cut it"],
  [/\bnot (just|only) [^.]{1,60}\bbut( also)?\b/i, `"not just X but Y": state Y`],
];

/** The rule reasons that match one line. */
export function check(line) {
  return RULES.filter(([pattern]) => pattern.test(line)).map(([, reason]) => reason);
}

// CHANGELOGs are generated from changesets, which are checked themselves.
const SKIP = /(^|\/)CHANGELOG\.md$/;

function report(name, text) {
  let found = 0;
  text.split("\n").forEach((line, i) => {
    for (const reason of check(line)) {
      found++;
      console.error(`${name}:${i + 1}: ${reason}\n    ${line.trim()}`);
    }
  });
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const at = process.argv.indexOf("--message");
  let found = 0;
  if (at > 0) {
    // Git's own comment lines (#) are dropped before the commit is stored.
    const message = readFileSync(process.argv[at + 1], "utf8")
      .split("\n")
      .filter((line) => !line.startsWith("#"))
      .join("\n");
    found = report("commit message", message);
  } else {
    const files = execFileSync("git", ["ls-files", "*.md", "*.ts", "*.mjs", "*package.json"], { encoding: "utf8" })
      .split("\n")
      .filter((file) => file && !SKIP.test(file) && file !== "scripts/lint-prose.mjs");
    for (const file of files) {
      let text = readFileSync(file, "utf8");
      // AGENTS.md lists the patterns in its Writing section, so that section is blanked (keeping line numbers).
      if (file === "AGENTS.md") text = text.replace(/## Writing\n[\s\S]*?(?=\n## )/, (section) => section.replace(/[^\n]/g, ""));
      found += report(file, text);
    }
  }
  if (found) console.error(`\n✖ ${found} prose problem${found === 1 ? "" : "s"} (rules in AGENTS.md, Writing)`);
  process.exit(found ? 1 : 0);
}
