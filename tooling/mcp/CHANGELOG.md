# @debuffjp/mcp

## 0.1.0

### Minor Changes

- 9d71ad0: Agents can now work on the game you have open. `debuff dev` relays agent commands to the page over Server-Sent Events, and `game_start` in `@debuffjp/mcp` attaches to that live tab when one is open (otherwise it falls back to a headless copy). The overlay shows an agent badge and logs the agent's actions, which you can undo. New MCP tools: `game_pause`, `game_frames` (per-frame breakdown) and `game_notes` (moments you flagged in the overlay). The WebGL2 draw-call count now includes the pending batch.
- f807f89: Errors are now explained, and a crash no longer freezes the game.
  
  - **Core:** an exception in `update` or `render` used to kill the requestAnimationFrame loop while the game still reported itself as running, so `start()` couldn't recover it. Now the loop stops cleanly and records `game.lastError` (phase, scene and tick). It emits the new `hooks.error` and rethrows the error so the console still shows it. `start()` resumes.
  - **Dev tools:** each error is labelled with whose problem it is: your code, a call debuff rejected, a debuff bug (with a prefilled report link) or something outside the game. It shows the source-mapped line, which opens in your editor, plus a plain-words hint. Repeats are counted. `errors()` and MCP `game_errors` return the same structure.
- 155638d: New `@debuffjp/mcp`: an MCP server with project tools (`inspect_project`, `list_assets`, `build`, `run_scenarios`) and live-game tools (`game_start`, `game_step`, `game_input`, `game_state`, `game_params`, `game_set_param`, `game_capture`, `game_errors`, `game_stop`). Templates include `.mcp.json`. `@debuffjp/cli` exports `inspectProject`, `launchBrowser`, `callHook` and `hooksReady`.

### Patch Changes

- 85ad1d7: The overlay's agent badge now stays on for as long as an agent is attached, not just for 30 seconds after its last action. It turns off when the agent stops or its process exits, and the activity log records "agent disconnected".
- 1487920: Automatic texture atlases. The asset pipeline packs PNGs per preload group into atlases (MaxRects, lossless, padded and edge-extruded), in dev and builds, cached by content hash. It's on by default; configure with `assets.atlas` in `debuff.config.ts` (`maxSize`, `padding`, `exclude`, or `false`).
  
  - `@debuffjp/assets`: new `frame(id)` and `frames(id)` work for atlased and standalone images, and assets sharing an atlas share one request. `image(id)` explains what to use for atlased assets.
  - `@debuffjp/tilemap`: tilesets accept an atlas region (`assets.frame(id)`).
- Updated dependencies [9d71ad0]
- Updated dependencies [85ad1d7]
- Updated dependencies [1487920]
- Updated dependencies [c4fe419]
- Updated dependencies [155638d]
- Updated dependencies [ec06222]
- Updated dependencies [71c6b6e]
- Updated dependencies [451831a]
- Updated dependencies [b25d482]
- Updated dependencies [f50defb]
  - @debuffjp/cli@0.1.0
