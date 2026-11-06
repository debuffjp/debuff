---
"@debuffjp/core": patch
---

Setting `game.pauseWhenHidden = false` while the tab is hidden now resumes a started game. Before, a game already halted for the hidden tab stayed halted until the tab was shown again.
