---
"@debuffjp/cli": patch
---

`debuff test` now runs the saves check from `debuff build` and accepts `--accept-saves`. It reads the saves in `src/`, compares them with `saves.json` and prints what changed, so a change to a save's shape shows up in the test run. `--accept-saves` updates `saves.json` as it does for the build, and `--json` output gains `saves`. The test run only reports: `debuff build` still fails on a save error. Before 0.29.3, `debuff test --accept-saves` failed with "Unknown option" and only the build checked saves.
