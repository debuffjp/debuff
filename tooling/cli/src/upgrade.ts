import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inFixedGroup, packageCommand, packageManager } from "./doctor.js";
import { DebuffError } from "./errors.js";
import { isNewer, latestVersion } from "./versions.js";

export const CHANGELOG = "https://github.com/debuffjp/debuff/blob/main/tooling/cli/CHANGELOG.md";

export interface UpgradePlan {
  /** The version every debuff package moves to. */
  to: string;
  /** Each debuff package in package.json: its declared range now, and after. */
  packages: { name: string; field: "dependencies" | "devDependencies"; from: string; to: string }[];
  /** False when every package already declares `to`. */
  changes: boolean;
}

export interface UpgradeResult extends UpgradePlan {
  /** The install command run, when there were changes and `install` wasn't false. */
  installed?: string;
  /** The new version's `debuff doctor --fix` afterwards: whether its required checks pass, and what it fixed. */
  doctor?: { ok: boolean; fixed: string[] };
  changelog: string;
}

type PackageJson = Record<string, unknown> & { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

const readPackage = (root: string): PackageJson => {
  const file = join(root, "package.json");
  if (!existsSync(file))
    throw new DebuffError("not_a_project", `No package.json in ${root}`, "Run from the project root, or pass --root <dir>");
  return JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, "")) as PackageJson;
};

/** A range for `version` in the style of `range`: `^0.19.0` stays a caret, `0.19.0` stays exact, `~` stays a tilde. */
const restyle = (range: string, version: string) => `${/^[\^~]/.exec(range)?.[0] ?? (/^\d/.test(range) ? "" : "^")}${version}`;

/** What `debuff upgrade` would change: every package in debuff's version group, moved together to `to` (default: the latest). */
export async function planUpgrade(root: string, options: { to?: string; fetch?: typeof fetch } = {}): Promise<UpgradePlan> {
  const pkg = readPackage(root);
  const to = options.to ?? (await latestVersion({ fetch: options.fetch, timeoutMs: 10_000 }));
  if (!to)
    throw new DebuffError(
      "network",
      "Couldn't reach the npm registry to find the latest debuff",
      "Check the connection, or pass --to <version>",
    );
  const packages: UpgradePlan["packages"] = [];
  for (const field of ["dependencies", "devDependencies"] as const)
    for (const [name, from] of Object.entries(pkg[field] ?? {}))
      if (inFixedGroup(name) && !from.startsWith("workspace:") && !from.startsWith("file:"))
        // Without --to, never downgrade a package that already declares something newer (a prerelease).
        packages.push({ name, field, from, to: !options.to && isNewer(from.replace(/^[^\d]*/, ""), to) ? from : restyle(from, to) });
  if (!packages.length)
    throw new DebuffError(
      "not_a_project",
      `No debuff packages in ${join(root, "package.json")}`,
      "Run from a debuff game's folder, or pass --root <dir>",
    );
  return { to, packages, changes: packages.some((p) => p.from !== p.to) };
}

/**
 * `debuff upgrade`: move every debuff package to one version, install, then run the new version's
 * `debuff doctor --fix`, which also rewrites the project's agent skills for it.
 */
export async function runUpgrade(
  root: string,
  options: { to?: string; dryRun?: boolean; install?: boolean; fetch?: typeof fetch; log?: (line: string) => void } = {},
): Promise<UpgradeResult> {
  const log = options.log ?? (() => {});
  const plan = await planUpgrade(root, options);
  const result: UpgradeResult = { ...plan, changelog: CHANGELOG };
  if (!plan.changes || options.dryRun) return result;

  const pkg = readPackage(root);
  for (const p of plan.packages) (pkg[p.field] as Record<string, string>)[p.name] = p.to;
  writeFileSync(join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  log(`package.json: ${plan.packages.length} debuff packages to ${plan.to}`);
  if (options.install === false) return result;

  const pm = packageManager(root);
  const args = packageCommand(pm, ["install"]);
  result.installed = [pm, ...args].join(" ");
  log(result.installed);
  // Output goes to stderr, so `--json` keeps stdout to one document.
  execFileSync(pm, args, { cwd: root, stdio: ["ignore", 2, 2], shell: process.platform === "win32" });

  // The new version's doctor knows the new version's checks and skills; this process is still the old CLI.
  const bin = join(root, "node_modules", "@debuffjp", "cli", "bin", "debuff.js");
  if (existsSync(bin)) {
    const r = spawnSync(process.execPath, [bin, "doctor", "--root", root, "--fix", "--json"], { cwd: root, encoding: "utf8" });
    try {
      const report = JSON.parse(r.stdout) as { ok: boolean; fixed?: string[] };
      result.doctor = { ok: report.ok, fixed: report.fixed ?? [] };
    } catch {
      result.doctor = { ok: r.status === 0, fixed: [] };
    }
  }
  return result;
}
