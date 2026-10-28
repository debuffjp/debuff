---
"@debuffjp/cli": patch
---

`debuff doctor` gives the fix (`npm install`) when `debuff.config.ts` fails only because nothing is installed yet, and `doctor --fix` and `upgrade` no longer print a Node deprecation warning (DEP0190) while installing on Windows.
