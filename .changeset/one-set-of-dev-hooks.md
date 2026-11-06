---
"@debuffjp/dev": patch
---

The agent link and `window.__DEBUFF_DEV__` now share one set of dev hooks. Before, each had its own, so a touch held through one surface couldn't be let go through the other (it stayed in `pointer.touches`), and a reduced-motion value forced by the agent showed as not forced in the other.
