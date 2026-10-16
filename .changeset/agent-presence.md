---
"@debuff/cli": patch
"@debuff/dev": patch
"@debuff/mcp": patch
---

The overlay's agent badge now stays on for as long as an agent is attached, not just for 30 seconds after its last action. It turns off when the agent stops or its process exits, and the activity log records "agent disconnected".
