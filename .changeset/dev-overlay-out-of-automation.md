---
"@debuffjp/dev": minor
---

The dev overlay stays out of automated runs and out of game state. In automated browsers (`navigator.webdriver`, as under scenario runs and agent harnesses) it now starts hidden, so it no longer sits in every screenshot or catches taps meant for the game's corner; the toggle key still shows it, and `devOverlay({ open: true })` keeps it visible. `state().plugins` leaves out debuff's own tools (providers named `dev-*`, such as the overlay's panel state), so harnesses that diff state see only the game.
