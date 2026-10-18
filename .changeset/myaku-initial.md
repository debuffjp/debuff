---
"myaku": minor
"@debuffjp/dev": minor
"@debuffjp/mcp": minor
---

New package: myaku, a frame profiler for web games. It finds the frames players feel drop and explains each one (script with its location, GC, GPU uploads, shader compiles, layout, browser throttling), for any engine. `@debuffjp/dev` starts it with debuff's update and render as spans and adds `profile()`; the MCP server adds `game_profile`, and the explain-stutter prompt uses it.
