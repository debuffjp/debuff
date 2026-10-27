---
"@debuffjp/cli": minor
---

`debuff fuzz --keys` accepts the gestures `Wheel` (a random scroll) and `Touch` (a finger tapping or dragging somewhere on the game), so touch and wheel games can be fuzzed: `debuff fuzz --keys Touch,Wheel`. They're opt-in; the default keys are unchanged.
