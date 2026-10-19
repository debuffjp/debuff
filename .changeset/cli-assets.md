---
"@debuffjp/cli": patch
---

Failed asset imports are no longer cached, malformed asset URLs get a 400 instead of hanging, sibling folders like `assets-src/` no longer trigger reloads, and image preloads match the versioned asset URLs.
