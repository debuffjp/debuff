---
"@debuffjp/cli": patch
"create-debuff": patch
"keiko": patch
---

Two fewer dependencies: terminal colours (`picocolors`) and argument parsing (`cac`) are now small built-in modules with the same behaviour, including `NO_COLOR`/`FORCE_COLOR` and the flag syntax plugin commands use.
