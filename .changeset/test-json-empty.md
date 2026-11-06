---
"@debuffjp/cli": patch
---

`debuff test --json` in a project with no tests prints its (empty) report on stdout again. Before, it went to stderr like a log line, so stdout was empty and tools reading one JSON document got nothing.
