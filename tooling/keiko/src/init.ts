import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import pc from "./ansi.js";

/*
 * `npx keiko init`: a first test for an existing game, written for the engine it uses, plus the
 * `window.__KEIKO__` hook to paste when tests need the game's own state. Never overwrites a file.
 */

export type InitEngine = "debuff" | "phaser" | "pixi" | "kaplay" | "excalibur" | "three" | "other";

/** The engine a project depends on, from its package.json. */
export function detectEngine(root: string): InitEngine {
  let pkg: Record<string, Record<string, string> | undefined> = {};
  try {
    pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (Object.keys(deps).some((d) => d.startsWith("@debuffjp/"))) return "debuff";
  if (deps.phaser) return "phaser";
  if (deps["pixi.js"]) return "pixi";
  if (deps.kaplay || deps.kaboom) return "kaplay";
  if (deps.excalibur) return "excalibur";
  if (deps.three) return "three";
  return "other";
}

/** The first module script in index.html: where the hook goes. */
function entryOf(root: string): string | undefined {
  try {
    const html = readFileSync(join(root, "index.html"), "utf8");
    const src = /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i.exec(html)?.[1];
    return src?.replace(/^\.?\//, "");
  } catch {
    return undefined;
  }
}

/** The smoke test for each engine. Phaser and PixiJS get keiko's engine reading, with no hook needed. */
export function smokeTest(engine: InitEngine): string {
  const head = `// Written by \`npx keiko init\`. Run with \`npx keiko\`. Docs: https://github.com/debuffjp/debuff/tree/main/tooling/keiko#readme
import { expect, play, test } from "keiko";
`;
  if (engine === "debuff")
    return `${head}
test("boots into a scene", async () => {
  const game = await play();
  expect(game.scene).toBeDefined();
});

test("plays 5 seconds without an error", async () => {
  const game = await play();
  game.wait("5s");
});
`;
  if (engine === "phaser" || engine === "pixi") {
    const what = engine === "phaser" ? "the active scene" : "the topmost screen";
    return `${head}
// keiko reads ${what} and the buttons on screen from ${engine === "phaser" ? "Phaser" : "PixiJS"} itself: game.engine.
const ready = (g) => g.engine?.scene !== undefined;

test("boots into a ${engine === "phaser" ? "scene" : "screen"}", async () => {
  const game = await play({ ready });
  expect(game.engine?.scene).toBeDefined();
});

test("plays 5 seconds without an error", async () => {
  const game = await play({ ready });
  await game.run("5s");
});

// Press a button the way a player would. See what's on screen with console.log(game.engine.targets).
// test("Play starts the game", async () => {
//   const game = await play({ ready });
//   await game.tapWhenReady((g) => g.engine?.targets.find((t) => t.text === "Play"));
//   await game.eventually(() => game.engine?.scene === "game", { within: "10s" });
// });
`;
  }
  return `${head}
test("plays 5 seconds without an error", async () => {
  const game = await play();
  await game.run("5s");
  expect(game.tick).toBeAbove(0);
});
`;
}

/** The hook to paste into the game's entry file, for tests that read its state. */
export function hookSnippet(engine: InitEngine): string | undefined {
  const open = "if (import.meta.env.DEV) {\n  window.__KEIKO__ = {\n";
  const close = "  };\n}\n";
  if (engine === "debuff") return undefined;
  if (engine === "phaser")
    return `${open}    scene: () => game.scene.getScenes(true).at(-1)?.scene.key,
    // What your tests assert on. Return undefined until it exists.
    state: () => {
      const s = game.scene.getScene("game"); // your main scene's key
      return s?.player ? { player: { x: Math.round(s.player.x), y: Math.round(s.player.y) }, score: s.score } : undefined;
    },
${close}`;
  if (engine === "pixi")
    return `${open}    // What your tests assert on: your screen manager's current screen, score, positions.
    state: () => ({ screen: navigation.currentScreen?.constructor.name, score: game?.score }),
${close}`;
  if (engine === "kaplay")
    return `${open}    state: () => {
      const player = k.get("player")[0];
      return player ? { player: { x: Math.round(player.pos.x), y: Math.round(player.pos.y) } } : undefined;
    },
${close}`;
  if (engine === "excalibur")
    return `${open}    scene: () => game.currentSceneName,
    state: () => ({ player: { x: Math.round(player.pos.x), y: Math.round(player.pos.y) } }),
${close}`;
  return `${open}    scene: () => currentScene,
    state: () => ({ player: { x: player.x, y: player.y }, score }),
${close}`;
}

/** Write the first test and print what to do next. Returns the exit code. */
export function init(root: string): number {
  const engine = detectEngine(root);
  if (!existsSync(join(root, "index.html"))) {
    console.log(`${pc.red("✖")} No index.html in ${root}. Run \`npx keiko init\` in the folder with your game's index.html.`);
    return 1;
  }
  const ts = existsSync(join(root, "tsconfig.json"));
  const file = join(root, "tests", `smoke.test.${ts ? "ts" : "js"}`);
  const shown = relative(process.cwd(), file).split("\\").join("/");
  const names: Record<InitEngine, string> = {
    debuff: "debuff",
    phaser: "Phaser",
    pixi: "PixiJS",
    kaplay: "KAPLAY",
    excalibur: "Excalibur",
    three: "three.js",
    other: "no engine keiko knows (a canvas loop, or an engine it hasn't met)",
  };
  console.log(`\n${pc.bold("keiko init")} ${pc.dim(`· ${names[engine]}`)}\n`);
  if (existsSync(file)) console.log(`${pc.yellow("•")} ${shown} already exists, so it was left as it is.`);
  else {
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(
      file,
      ts
        ? smokeTest(engine)
            .replace("const ready = (g) =>", "const ready = (g: Playtest) =>")
            .replace("import { expect, play, test }", "import { expect, play, type Playtest, test }")
        : smokeTest(engine),
    );
    console.log(`${pc.green("✔")} Wrote ${shown}. Run it: ${pc.cyan("npx keiko")}`);
  }
  if (ts) console.log(`${pc.dim("  TypeScript: add")} "tests" ${pc.dim("to")} include ${pc.dim("in tsconfig.json.")}`);

  const hook = hookSnippet(engine);
  if (engine === "debuff") console.log(`\n${pc.green("✔")} debuff games need no hook: keiko drives them through their dev tools.`);
  else if (hook) {
    const entry = entryOf(root);
    console.log(
      `\nWhen tests need your game's own state (a score, the player's position), add this hook to ${entry ? pc.bold(entry) : "your entry file"}` +
        ` and fill in your names:\n\n${pc.dim(hook)}`,
    );
    if (engine === "phaser" || engine === "pixi")
      console.log(
        `Until then, ${pc.cyan("game.engine")} gives you the active ${engine === "phaser" ? "scene" : "screen"} and the buttons on screen.`,
      );
    console.log(`Guide: ${pc.cyan("https://debuff.jp/keiko/engines#hooking-up-an-existing-game")}`);
  }
  console.log("");
  return 0;
}
