---
"create-debuff": patch
---

The `debuff` agent skill now loads for everyday work in a debuff project (fixing a bug, tuning feel, adding a mechanic, changing art), not only when starting a new game. Before 0.21.1 its description led with making a new game, and in a skill eval Claude Code never loaded it for those tasks. Run `npx debuff doctor --fix` to update a project's skills.
