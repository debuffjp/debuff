import { relative } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { badge, lime } from "./brand.js";
import { detectPackageManager, isEmptyDir, listTemplates, ownVersion, scaffold } from "./scaffold.js";

export interface CreateOptions {
  dir?: string | undefined;
  template?: string | undefined;
  /** Accept defaults without prompting (CI, agents). */
  yes?: boolean;
}

/** Interactive scaffold flow. Falls back to defaults when stdin is not a TTY so agents
 *  and CI can call it non-interactively. */
export async function runCreate(options: CreateOptions): Promise<number> {
  const interactive = process.stdin.isTTY && !options.yes;
  p.intro(`${badge()} ${pc.dim(`v${ownVersion()}`)}  ${lime(pc.italic("more room for play"))}`);

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
      options: templates.map((t) => ({ value: t.id, label: t.title, hint: t.description })),
    });
    if (p.isCancel(answer)) return cancelled();
    template = answer;
  }

  const s = p.spinner();
  s.start("Scaffolding");
  const dest = scaffold({ dir, ...(template ? { template } : {}) });
  s.stop(`Created ${lime(relative(process.cwd(), dest) || ".")}`);

  const pm = detectPackageManager();
  const run = pm === "npm" ? "npm run" : pm;
  p.note([`cd ${relative(process.cwd(), dest) || "."}`, `${pm} install`, `${run} dev`].join("\n"), "Next steps");
  p.outro("Happy jamming.");
  return 0;
}

function cancelled(): number {
  p.cancel("Cancelled");
  return 1;
}
