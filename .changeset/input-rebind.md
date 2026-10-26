---
"@debuffjp/input": minor
---

`input.rebind(action, keys)` replaces an action's bindings, for controls menus. It takes a copy of `keys` and updates `input.keys.captured`, so newly bound keys stop scrolling the page and keys no longer bound scroll it again; keys the game added to `captured` itself are left alone. `input.bindings` is now Input's own copy of the map passed in, so rebinding never changes the caller's object. The lists inside it are still the caller's arrays until rebound, so existing code that edits them in place keeps working.
