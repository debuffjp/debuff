---
"@debuffjp/cli": patch
---

`debuff dev` recovers from a failed asset compile. Before, a failure stayed cached, and every `/assets/` request kept failing until another file in `assets/` changed; now the next request compiles again. A compile failure at startup is logged instead of becoming an unhandled rejection. A dangling symlink in `assets/`, such as the `.#name` lock link Emacs writes while you edit, is skipped instead of failing the compile.
