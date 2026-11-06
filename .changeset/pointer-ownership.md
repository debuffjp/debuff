---
"@debuffjp/input": patch
---

The primary pointer stays with the contact that pressed it. On a touch laptop, a mouse click or hover while a finger holds the pointer no longer releases or moves it. A left click made while the right button is held now presses (and its release releases) the pointer; before, it was lost. A click after a `pointerup` that never arrived (released outside the window) presses again instead of being swallowed.
