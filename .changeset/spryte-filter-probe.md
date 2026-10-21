---
"spryte": patch
---

Canvas 2D fallback: browsers whose Canvas 2D ignores `ctx.filter` (Safari before 18) now warn once and draw unfiltered, detected with a one-pixel probe. GPU checks run in Firefox and WebKit too (`SPRYTE_BROWSER=firefox|webkit`).
