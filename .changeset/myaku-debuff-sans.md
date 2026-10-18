---
"myaku": minor
"@debuffjp/dev": patch
---

myaku's overlay takes an opt-in label font: `import { debuffSans } from "myaku/debuff-sans"` and pass `overlay(profiler, { font: debuffSans })`. It costs about 3.5 kB brotli, only when imported. The debuff dev overlay now uses this copy of the font instead of its own.
