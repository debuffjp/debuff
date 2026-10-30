import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as p from "@clack/prompts";
import pc from "./ansi.js";
import { banner, lime, pink, sky } from "./brand.js";
import { initGit } from "./git.js";
import {
  create,
  detectPackageManager,
  isEmptyDir,
  listTemplates,
  ownVersion,
  resolveTemplate,
  type TemplateInfo,
  type TemplateKind,
} from "./scaffold.js";

export interface CreateOptions {
  dir?: string | undefined;
  template?: string | undefined;
  /** Accept defaults without prompting (CI, agents). */
  yes?: boolean;
  /** Start a git repository with a first commit. Default true; `--no-git` turns it off. */
  git?: boolean;
}

/** The template list as select options, under a heading per kind. Headings are disabled rows, so the cursor skips them. */
export function templateOptions(templates: readonly TemplateInfo[]): { value: string; label: string; hint?: string; disabled?: boolean }[] {
  const heading: Record<TemplateKind, string> = {
    base: "Base templates: a starting point for your own game",
    example: "Examples: finished small games to learn from",
  };
  const options: { value: string; label: string; hint?: string; disabled?: boolean }[] = [];
  for (const kind of ["base", "example"] as const) {
    const group = templates.filter((t) => t.kind === kind);
    if (group.length === 0) continue;
    options.push({ value: `#${kind}`, label: pc.dim(heading[kind]), disabled: true });
    for (const t of group) options.push({ value: t.id, label: t.title, hint: t.description });
  }
  return options;
}

/** Interactive scaffold flow. Falls back to defaults when stdin is not a TTY so agents
 *  and CI can call it non-interactively. */
export async function runCreate(options: CreateOptions): Promise<number> {
  const interactive = process.stdin.isTTY && !options.yes;
  console.log(
    `\n${banner("idle", [`${lime(pc.bold("debuff"))} ${pc.dim(`v${ownVersion()}`)}`, pc.bold("let's make a game"), pc.dim(pc.italic("more room for play"))])}\n`,
  );

  let dir = options.dir;
  if (!dir) {
    if (!interactive) {
      p.cancel("Pass a directory: create-debuff <dir>");
      return 1;
    }
    const answer = await p.text({
      message: "Where should we create your game?",
      placeholder: "./my-game",
      defaultValue: "my-game",
      validate: (v) => (v && !isEmptyDir(v) ? "That directory is not empty" : undefined),
    });
    if (p.isCancel(answer)) return cancelled();
    dir = answer;
  }
  if (!isEmptyDir(dir)) {
    p.cancel(`${dir} is not empty`);
    return 1;
  }

  const templates = listTemplates();
  let template = options.template;
  if (!template && interactive && templates.length > 1) {
    const answer = await p.select({
      message: "Pick a template",
      options: templateOptions(templates),
      initialValue: templates[0]?.id,
    });
    if (p.isCancel(answer)) return cancelled();
    template = answer;
  }

  const s = p.spinner();
  const resolved = resolveTemplate(template ?? "basic");
  s.start(resolved.kind === "remote" ? `Downloading ${resolved.source}` : "Scaffolding");
  const dest = await create({ dir, ...(template ? { template } : {}) });
  s.stop(`Created ${lime(relative(process.cwd(), dest) || ".")}`);
  if (options.git !== false) {
    const git = initGit(dest, `New debuff game from the ${template ?? "basic"} template`);
    if (git.status === "committed") p.log.step("Started a git repository with a first commit");
    else if (git.status === "initialised") p.log.warn(`Started a git repository, but didn't commit: ${git.reason}`);
    else p.log.info(pc.dim(`No git repository: ${git.reason}`));
  }

  const pm = detectPackageManager();
  const run = pm === "npm" ? "npm run" : pm;
  const steps = [`cd ${relative(process.cwd(), dest) || "."}`, `${pm} install`, `${run} dev`].map((c) => sky(c));
  const test = testScript(dest);
  if (test)
    steps.push(
      `${sky(`${pm} test`)}  ${pc.dim(test.includes("scenario") ? "logic tests, then screenshot scenarios in a headless browser" : "tests")}`,
    );
  p.note(steps.join("\n"), "Next steps");
  console.log(
    `\n${banner("happy", [lime(pc.bold("happy jamming!")), `${pc.dim("buff is waiting in")} ${pink("src/main.ts")}`, `${pc.dim("say hi on")} ${sky("discord.gg/jshbDHSpCY")}`, ""])}\n`,
  );
  return 0;
}

function cancelled(): number {
  p.cancel("Cancelled");
  return 1;
}

/** The project's `test` script, or undefined. */
function testScript(dir: string): string | undefined {
  try {
    const test = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts?.test;
    return typeof test === "string" && test ? test : undefined;
  } catch {
    return undefined;
  }
}
