import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const user = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });

/** Rules every workflow shares: evidence first, the human owns creative calls. */
const RULES = `Rules: the human makes creative calls (art, feel, difficulty, names). Propose options instead of deciding. Don't update screenshot baselines without their approval. If game_errors reports kind "debuff-bug", tell the human and share its reportUrl instead of working around debuff.`;

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
3. Watch game_errors throughout, and use game_frames if anything stutters.
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
3. Reload (game_start again), reproduce the steps that caused the error with game_input and game_step, and confirm game_errors stays empty.
4. Run \`npm test\` and \`npm run build\`, then report what you changed and how you verified it.

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
4. Once the human picks a variant, update the defaults in game.params.define(...) in the code, and add or adjust a scenario if the change affects behaviour.

Feel is a creative call: present the options and let the human choose. ${RULES}`),
  );

  server.registerPrompt(
    "add-mechanic",
    {
      title: "Add a mechanic",
      description: "Implement a gameplay mechanic in small steps, with a scenario that proves it works.",
      argsSchema: { mechanic: z.string().describe("The mechanic, e.g. 'a double jump' or 'coins that respawn'.") },
    },
    ({ mechanic }) =>
      user(`Add this mechanic: ${mechanic}

1. Call inspect_project and read src/main.ts to see how scenes, input and params are set up. Confirm the plan with the human in two or three lines before building, and ask about anything creative (look, sound, numbers).
2. Implement the smallest version that works. Put tunable numbers in game.params.define(...), use debuff's draw, input and juice APIs, and keep dev-only code inside if (import.meta.env.DEV).
3. Add a scenario in scenarios/ that drives the inputs and checks the outcome with expect on state from the scene's inspect().
4. Verify: run_scenarios, then build (its leaks list must be empty), then game_start and game_capture to show it working. Check game_errors is empty.
5. Report what you built, the params added, and the evidence.

${RULES}`),
  );

  server.registerPrompt(
    "explain-stutter",
    {
      title: "Explain stutter",
      description: "Find out why frames drop, and whether the game or something outside it is the cause.",
    },
    () =>
      user(`Find out why this game stutters.

1. Call game_start (live mode gives real timings; headless timings only reflect stepping), then game_frames with count 240.
2. Classify the dropped frames (intervalMs over about 25): high updateMs means game logic; high renderMs with many quads or drawCalls means drawing; steps over 1 means the loop was catching up; longTaskMs or little work means something outside the game (GC, the browser, other tabs).
3. Point to the likely code (the update or render of the active scene, from game_state) and propose a fix. Measure again after any change.

${RULES}`),
  );
}
