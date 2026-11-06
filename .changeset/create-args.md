---
"create-debuff": patch
---

`npm create debuff --yes my-game` (and `--no-git my-game` or `--color my-game`) finds the directory again. Before, any argument after a `--` flag was taken to be that flag's value, so it stopped with "Pass a directory". Only `--template` takes a value.
