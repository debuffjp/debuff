---
"@debuffjp/core": minor
---

`SpatialHash` answers "what's near this" without checking every pair: `rebuild(items)` once per step, then `near(x, y, radius, visit)` for every item within the radius (return `true` to stop) or `nearest(x, y, radius, accept?)`. Results come in a fixed order for deterministic replays, distances are exact, and after the first steps it allocates nothing; cells that stay empty for a whole fill are released. On a crowd of 500 to 2,000 enemies each querying its neighbours it measured 4 to 15 times faster than checking every pair, and level with the grid overbuffed wrote for itself.
