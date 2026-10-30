---
"@debuffjp/dev": minor
"@debuffjp/mcp": minor
"@debuffjp/cli": minor
---

Clips and social-size stills for devlogs, store pages and press kits, all on the developer side.

- The dev panel has **rec** and **clip**: rec keeps the last 15 s of the game, clip saves them as a video in `.debuff/captures/` (MP4 where the browser can record it, else WebM). The dev hooks have `clips(on)` and `saveClip(name)` for the same.
- `capture("social")` letterboxes the frame into 1200×675, the size X and Bluesky show for post images and link cards, scaled by whole pixels so pixel art stays crisp. `capture([w, h])` takes any size.
- MCP: `game_clip` (live mode: start, save, stop), `social: true` on `game_capture`, and a `devlog-post` prompt that captures a still and a clip and drafts short posts for the human to send. Agents never post.
- `debuff dev` writes captures through a new `/__debuff/capture` endpoint, behind the same own-origin guard as the others.
- `debuff ship press` adds stills and clips from `.debuff/captures/` to the kit and flags WebM clips, which X and most stores don't take.

Nothing is added to games: templates and builds are unchanged.
