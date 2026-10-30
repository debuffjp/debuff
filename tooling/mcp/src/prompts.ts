import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const user = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

/** Rules every workflow shares: evidence first, the human owns creative calls. */
const RULES = `Rules: the human makes creative calls (art, feel, difficulty, names). Propose options instead of deciding. Don't update screenshot baselines without their approval. Pixel art the game needs is drawn with the tenten MCP server (tt_new, tt_draw, tt_save to assets/<name>.tt) unless the human names another tool. If game_errors reports kind "debuff-bug", tell the human and share its reportUrl instead of working around debuff.`;

/**
 * Ready-made workflows for agents, exposed as MCP prompts (slash commands in clients like Claude Code).
 * Each one is a short playbook built only from this server's tools and the project's npm scripts.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "playtest",
    {
      title: "Playtest the game",
      description: "Play the game, look for bugs and rough edges, and report findings with evidence.",
      argsSchema: { focus: z.string().optional().describe("What to focus on, e.g. 'the second level' or 'jumping'.") },
    },
    ({ focus }) =>
      user(`Playtest this debuff game${focus ? `, focusing on ${focus}` : ""}.

1. Call game_start. In live mode, read game_notes first: they're moments the human flagged.
2. Call game_state and game_capture to see where things are, then play: game_input for keys and pointer, game_step to advance time (60 steps = 1 second). Capture before and after anything interesting.
3. Watch game_errors throughout, and use game_profile if anything stutters.
4. Report a short list of findings. For each: what you did, what happened, what you expected, a capture, and severity (bug, feel, polish). Suggest fixes, but don't change code yet.

${RULES}`),
  );

  server.registerPrompt(
    "fix-errors",
    {
      title: "Fix runtime errors",
      description: "Read the explained runtime errors, fix the ones in this game's code, and verify.",
    },
    () =>
      user(`Fix this game's runtime errors.

1. Call game_start, then game_errors. Each error says whose problem it is (kind), where (a source file and line) and what to try (hint).
2. kind "your-code": open the file at "where", fix the cause rather than the symptom, and keep the change small.
   kind "debuff-usage": debuff rejected a call. The message says what it expected, so fix the call site.
   kind "debuff-bug": don't patch around it. Tell the human and share reportUrl.
   kind "outside": usually a browser extension. Mention it and move on.
3. Write a logic test in tests/ that reproduces it (play(), then the inputs and steps that caused it; game.replay(file) if you have a replay or fuzz finding), and run_tests to watch it fail.
4. Fix, run_tests until it passes, and keep the test. Then call typecheck and fix any type errors, run \`npm test\` and \`npm run build\`, and report what you changed and how you verified it.

${RULES}`),
  );

  server.registerPrompt(
    "tune-feel",
    {
      title: "Tune game feel",
      description: "Propose param changes for a feel goal, try them live, and let the human choose.",
      argsSchema: { goal: z.string().describe("The feel to aim for, e.g. 'jumps feel floaty' or 'make movement snappier'.") },
    },
    ({ goal }) =>
      user(`Help tune this game's feel. Goal: ${goal}

1. Call game_start, then game_params to see every tunable value with its range and units. In live mode, read game_notes too.
2. Propose two or three variants, each a small set of param changes with a one-line reason. Prefer params over code changes.
3. With the human's go-ahead, apply one variant with game_set_param, play a few seconds (game_input and game_step) and capture it. The human can undo every change in the dev panel.
4. Once the human picks a variant, update the defaults in game.params.define(...) in the code, and add or adjust a logic test in tests/ if the change affects behaviour (test.sweep checks a range of values), then run_tests.

Feel is a creative call: present the options and let the human choose. ${RULES}`),
  );

  server.registerPrompt(
    "add-mechanic",
    {
      title: "Add a mechanic",
      description: "Implement a gameplay mechanic in small steps, with a logic test that proves it works.",
      argsSchema: { mechanic: z.string().describe("The mechanic, e.g. 'a double jump' or 'coins that respawn'.") },
    },
    ({ mechanic }) =>
      user(`Add this mechanic: ${mechanic}

1. Call inspect_project and read src/main.ts to see how scenes, input and params are set up. Confirm the plan with the human in two or three lines before building, and ask about anything creative (look, sound, numbers).
2. Implement the smallest version that works. Put tunable numbers in game.params.define(...), use debuff's draw, input and juice APIs, and keep dev-only code inside if (import.meta.env.DEV).
3. Add a logic test in tests/ (keiko) that plays the inputs and checks the outcome on the scene's inspect() state; use until() and trace() for timing and motion. If the change is visual, add a scenario with a capture too.
4. Verify: run_tests, then run_scenarios, then build (its leaks list must be empty), then game_start and game_capture to show it working. Check game_errors is empty.
5. Report what you built, the params added, and the evidence.

${RULES}`),
  );

  server.registerPrompt(
    "devlog-post",
    {
      title: "Draft a devlog post",
      description: "Capture a still and a clip of what changed, and draft short posts for X and Bluesky. The human posts them.",
      argsSchema: { topic: z.string().optional().describe("What to post about, e.g. 'the new boss'. Default: the latest changes.") },
    },
    ({ topic }) =>
      user(`Draft a devlog post about ${topic ?? "this game's latest changes"}.

1. Find what changed: read the recent git log and CHANGELOG.md if there is one. Ask the human which change to show if it isn't clear.
2. Call game_start (live mode, so the clip records real play). Get the game to the moment that shows it: ask the human to play it, or drive it with game_input.
3. Call game_clip with action start, play through the moment, then game_clip save with a descriptive name, then stop. Call game_capture with social: true and path .debuff/captures/<name>.png for a 1200×675 still.
4. Draft two or three short posts in the human's voice from earlier posts if they share any: what changed and why it's fun, in plain words, at most 280 characters on X (a link counts 23) and 300 on Bluesky. No hashtag walls; one tag like #gamedev at most, and only if the human uses them.
5. Give the drafts, the saved files, and if the human wants a ready link, postIntent() from @debuffjp/share builds an X or Bluesky compose URL in a dev script or the console.

Never post, sign in or call a social API yourself, and never add sharing or promotion to the game: the human decides what the game and their posts contain. ${RULES}`),
  );

  server.registerPrompt(
    "explain-stutter",
    {
      title: "Explain stutter",
      description: "Find out why frames drop, and whether the game or something outside it is the cause.",
    },
    () =>
      user(`Find out why this game stutters.

1. Call game_start (live mode gives real timings; headless timings only reflect stepping). Let it run (or play it with game_input) for a few seconds, then call game_profile.
2. Read the worst hitches: each has a cause, a confidence, the script to look at when known (where), and a hint. "throttled" and "hidden" mean the browser, not the game: ask the human to bring the window to the front and measure again.
3. For "script" with a location, read that code; with only spans, compare update and render, and use game_frames (count 240) for steps over 1 (the loop catching up). Propose a fix, then measure again after the change.

${RULES}`),
  );
}
