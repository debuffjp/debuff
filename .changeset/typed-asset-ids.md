---
"@debuffjp/assets": minor
"@debuffjp/cli": minor
"create-debuff": minor
---

Asset ids are typed. `debuff dev`, `debuff build` and `npx debuff assets` write `.debuff/assets.d.ts`, which lists every asset id with its type and preload group, so a misspelt id (`assets.json("levle1")`), an id of the wrong type or an unknown group fails to compile. New templates include the file in `tsconfig.json` and run `debuff build` before `tsc`. In an existing project, add `".debuff/assets.d.ts"` to `include` and run `debuff build` before `tsc`; without the file, ids stay plain strings as before. `AssetId<T>` and `AssetGroup` are exported for your own signatures.
