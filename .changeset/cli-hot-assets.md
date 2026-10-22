---
"@debuffjp/cli": minor
---

`debuff dev` re-fetches changed level and data files in place instead of reloading the page, when the compiled manifest serves the file as json or text and a loader holds it; anything else (images, sounds, added or removed files, data no loader has) still reloads the page. Asset recompiles after a change run one at a time, so the served manifest is always the latest.
