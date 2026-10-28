---
"create-debuff": patch
---

The `debuff` agent skill now also loads when asked to make the player jump higher or run faster, make the game look nicer, or when `npm test`, a build or a debuff command fails. A new section near the top tells agents not to edit art or feel until the human picks one of two or three options. Before this, agents in the skill eval read the old line ("propose options and let them choose") and redrew the art anyway.
