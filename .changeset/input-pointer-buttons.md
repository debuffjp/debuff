---
"@debuffjp/input": minor
"@debuffjp/dev": minor
"@debuffjp/cli": minor
---

The right and middle mouse buttons are bindable: `"PointerRight"` and `"PointerMiddle"`, so an action like right-click remove goes through `input.down/pressed/released`, scenarios and fuzz like any key. `input.pointer.right` and `input.pointer.middle` hold `down`, `pressed` and `released`, including buttons pressed while another is held; `pointer.pressButton("right")` and `releaseButton` simulate them. The dev hooks' `press("PointerRight")`, scenario `{ "press": "PointerRight" }` and `debuff fuzz --keys PointerRight` press the button, and recorded replays keep it. The primary pointer (`"Pointer"`) is unchanged.
