---
"@debuffjp/cli": minor
"@debuffjp/mcp": minor
---

Scenarios, fuzz runs and headless MCP games now fail with `game_hung` when a call into the game takes over 60 s, instead of hanging forever; a scenario's `stepTimeout` changes the limit. A page crash fails the scenario and stops it. Scenario reports gain `warnings`: console errors and failed requests, which don't fail the run. New `scenarios.renderer` config: `"software"` draws with SwiftShader so captures don't depend on the graphics card; the default stays `"gpu"`, so existing baselines keep working.
