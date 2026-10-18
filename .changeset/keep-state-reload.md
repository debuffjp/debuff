---
"@debuffjp/dev": minor
"@debuffjp/cli": minor
---

New: state-preserving reload. Under `debuff dev`, a code change no longer sends you back to the start. Just before the page reloads, the dev tools save the session's inputs, and the new code replays them to the tick you were on (without drawing, so it's quick). The game then carries on running. Because the replay runs your new code, a change to how the game plays shows up right where you were. Keys you were holding are let go after the replay. Turn it off with `devTools({ input, keepState: false })`.
