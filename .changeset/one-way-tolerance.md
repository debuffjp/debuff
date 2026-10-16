---
"@debuff/tilemap": minor
---

New `oneWayTolerance` option for `move()`. A falling body whose feet are up to that many pixels inside a one-way platform still lands, snapping up onto it. Set it to the plank art's thickness, so a jump that visually reaches the platform catches it instead of dropping back through.
