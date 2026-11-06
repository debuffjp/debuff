// Compares a henka run with a StrykerJS run on the same package: counts for each, the verdicts on the mutants
// both tools made (same file, same line, same replacement text), and henka's misses sorted by triage.json.
//
//   node bench/mutation/compare.mjs [henka.json] [stryker.json]
import { readFileSync } from "node:fs";

const here = new URL("./", import.meta.url);
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const henka = read(process.argv[2] ?? new URL("results/2026-11-06-win32-juice-henka.json", here));
const stryker = read(process.argv[3] ?? new URL("results/2026-11-06-win32-juice-stryker.json", here));
const triage = read(new URL("triage.json", here));
const norm = (text) => text.replace(/\s+/g, " ").trim();
const killed = (status) => status === "Killed" || status === "Timeout";
const pct = (n, of) => `${((n / of) * 100).toFixed(1)}%`;

const theirs = Object.entries(stryker.files).flatMap(([file, { mutants }]) =>
  mutants.map((m) => ({
    file,
    line: m.location.start.line,
    replacement: norm(m.replacement ?? ""),
    status: m.status,
    mutator: m.mutatorName,
  })),
);
const covered = theirs.filter((m) => m.status !== "NoCoverage");
const strykerKilled = theirs.filter((m) => killed(m.status)).length;
console.log(`henka:   ${henka.outcomes.length} mutants, ${henka.counts.caught} caught, ${henka.counts.missed} missed`);
console.log(
  `Stryker: ${theirs.length} mutants, ${strykerKilled} killed or timed out (${pct(strykerKilled, theirs.length)}; ${pct(strykerKilled, covered.length)} of the ${covered.length} on code that ran)`,
);

let shared = 0;
let several = 0;
const disagree = [];
const matched = new Set();
for (const o of henka.outcomes) {
  const m = o.mutant;
  const after = norm(m.label.split(" → ").slice(1).join(" → "));
  const same = theirs.filter((x) => x.file === m.file && x.line === m.line && x.replacement === after);
  if (same.length === 0) continue;
  shared++;
  for (const x of same) matched.add(x);
  // Two identical edits on one line (`2 * t` twice) can't be told apart by text: agree if either does.
  if (same.length > 1) several++;
  if (!same.map((x) => killed(x.status)).includes(o.outcome === "caught"))
    disagree.push(`${o.outcome} vs ${same.map((x) => x.status)}  ${m.label}`);
}
console.log(`shared:  ${shared} mutants (${several} match more than one of Stryker's), ${shared - disagree.length} with the same verdict`);
for (const line of disagree) console.log(`  ${line}`);

const only = theirs.filter((x) => !matched.has(x) && x.status === "Survived");
const byMutator = {};
for (const x of only) byMutator[x.mutator] = (byMutator[x.mutator] ?? 0) + 1;
console.log(`Stryker only: ${only.length} survived on code that ran, by mutator`, byMutator);

const at = (o) => o.mutant.label.split(" ")[0];
const sort = { uncovered: 0, branch: 0, equivalent: 0, tuning: 0, gap: 0 };
for (const o of henka.outcomes.filter((o) => o.outcome === "missed")) {
  const id = at(o);
  if (triage.uncovered.includes(id)) sort.uncovered++;
  else if (triage.branch.ids.includes(id)) sort.branch++;
  else if (id in triage.equivalent) sort.equivalent++;
  else if (id in triage.tuning) sort.tuning++;
  else sort.gap++;
}
console.log("henka misses:", sort);
