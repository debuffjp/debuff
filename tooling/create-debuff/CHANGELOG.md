# create-debuff

## 0.1.0

### Minor Changes

- 155638d: New `@debuffjp/mcp`: an MCP server with project tools (`inspect_project`, `list_assets`, `build`, `run_scenarios`) and live-game tools (`game_start`, `game_step`, `game_input`, `game_state`, `game_params`, `game_set_param`, `game_capture`, `game_errors`, `game_stop`). Templates include `.mcp.json`. `@debuffjp/cli` exports `inspectProject`, `launchBrowser`, `callHook` and `hooksReady`.
- f609f0b: New official **platformer** template (`npm create debuff -- --template platformer`): buff runs and jumps through a Tiled level with tile collision, one-way platforms, coins, a goal, an automatically built atlas, coyote time, jump buffering and fully tunable movement. Official templates other than `basic` download on demand from the debuff repo, so they never grow the create-debuff package. `create()` and `resolveTemplate()` are new exports.
- ab4a23d: Community templates from git (ADR 0004, phase 4): `--template github:user/repo[/subdir][#ref]`, plus `gitlab:`, `bitbucket:` and `sourcehut:`. Downloads use giget, so no git binary is needed.
- b25d482: Tooling plugins (ADR 0004, phase 2a).
  
  - New: `debuff.config.ts` with `defineConfig({ plugins })`, `ToolingPlugin` with function and command (any language, JSON over stdio) asset importers, cached by content hash.
  - **Breaking:** source assets move from `public/assets/` to `assets/`. The manifest is generated in memory and is no longer written to disk, and builds ship only files the manifest references.
  - `debuff assets --json` and `debuff inspect` report importers and plugin contributions.

### Patch Changes

- c4fe419: Branded tooling: buff appears as terminal pixel art in CLI headers and reacts to results (happy or oops). A lime palette with sky, pink, amber and violet accents colours CLI output. The dev overlay gets a live buff that blinks and looks worried on frame spikes, a colour-coded FPS chip and accent-coloured param groups.
- 71b6dd3: The brand lime is now `#cffb2d`, the Debuff Foundation colour. Its tints are rebuilt around it, and the change covers the splash, the dev panel, the CLI colours, the templates and the art.
