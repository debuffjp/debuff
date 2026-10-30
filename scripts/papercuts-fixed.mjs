// After a release: commits since the previous release that say "Fixes papercut #12" mark #12 fixed in
// this version on papercuts.debuff.jp. The Release workflow runs it only when this push published a new
// version, so a papercut the maintainer reopened isn't marked fixed again by a later push.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("tooling/cli/package.json", "utf8"));
const token = process.env.PAPERCUTS_FIX_TOKEN;
if (!token) {
  console.log("PAPERCUTS_FIX_TOKEN isn't set: not marking papercuts fixed.");
  process.exit(0);
}

const tags = execSync("git tag -l '@debuffjp/cli@*' --sort=-v:refname", { encoding: "utf8" }).split("\n").filter(Boolean);
const previous = tags.find((t) => t !== `@debuffjp/cli@${version}`);
const log = execSync(`git log --format=%B ${previous ? `${previous}..HEAD` : "-200"}`, { encoding: "utf8" });

/** "Fixes papercut #12", "fixed papercuts #3, #4 and #9". */
const fixedIn = (text) => [
  ...new Set(
    [...text.matchAll(/\bfix(?:es|ed)?\s+papercuts?\s+((?:#\d+(?:,\s*|\s+and\s+|\s*))+)/gi)].flatMap((m) =>
      [...m[1].matchAll(/#(\d+)/g)].map((x) => Number(x[1])),
    ),
  ),
];

const ids = fixedIn(log);
if (!ids.length) console.log(`No commits since ${previous ?? "the start"} fix a papercut.`);
const base = (process.env.DEBUFF_PAPERCUTS_URL ?? "https://papercuts.debuff.jp").replace(/\/+$/, "");
for (const id of ids) {
  const res = await fetch(`${base}/api/entries/${id}/fixed`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ fixedIn: version }),
    signal: AbortSignal.timeout(10_000),
  });
  console.log(res.ok ? `#${id} is marked fixed in ${version}` : `#${id}: HTTP ${res.status} ${await res.text()}`);
}
