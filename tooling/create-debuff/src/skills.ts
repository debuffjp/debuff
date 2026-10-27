import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The agent skills a project carries, matched to its debuff version. Same files as the Claude and Codex plugins. */
export const PROJECT_SKILLS = ["debuff", "debuff-setup", "keiko", "myaku"] as const;

/**
 * Where agents look for a project's skills: Claude Code reads `.claude/skills`; Codex, Gemini CLI, Cursor and
 * Copilot read `.agents/skills`. Each gets its own copy, since symlinks don't survive Windows or a zip.
 */
export const SKILL_DIRS = [".claude/skills", ".agents/skills"] as const;

/** The plugin's skills: bundled into the package at build, or the repo's own during development. */
export function skillsDir(): string {
  const bundled = join(here, "..", "skills");
  const repo = join(here, "..", "..", "..", "plugins", "debuff", "skills");
  const installed = here.split(sep).includes("node_modules");
  for (const dir of installed ? [bundled] : [repo, bundled]) if (existsSync(dir)) return dir;
  throw new Error("create-debuff: skills directory not found");
}

/** A SKILL.md stamped with the debuff version it describes (`metadata.debuff-version`, per the Agent Skills spec). */
export function stampSkill(text: string, version: string): string {
  const end = text.indexOf("\n---", 4);
  if (!text.startsWith("---") || end < 0) return text;
  return `${text.slice(0, end)}\nmetadata:\n  debuff-version: "${version}"${text.slice(end)}`;
}

/** The debuff version a project's skills were written for, or undefined when they're missing (`.claude/skills/debuff`). */
export function projectSkillsVersion(root: string): string | undefined {
  const file = join(root, SKILL_DIRS[0], "debuff", "SKILL.md");
  if (!existsSync(file)) return undefined;
  return /^ {2}debuff-version: "([^"]+)"/m.exec(readFileSync(file, "utf8"))?.[1] ?? "unknown";
}

/** Write the project's agent skills for `version` into every agent's folder. Returns the files written. */
export function writeProjectSkills(root: string, version: string, source = skillsDir()): string[] {
  const written: string[] = [];
  for (const name of PROJECT_SKILLS) {
    const from = join(source, name, "SKILL.md");
    if (!existsSync(from)) continue;
    const text = stampSkill(readFileSync(from, "utf8"), version);
    for (const dir of SKILL_DIRS) {
      const file = join(root, dir, name, "SKILL.md");
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      written.push(`${dir}/${name}/SKILL.md`);
    }
  }
  return written;
}
