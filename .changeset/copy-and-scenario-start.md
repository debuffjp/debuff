---
"@debuffjp/dev": patch
"@debuffjp/cli": patch
---

- The dev overlay's copy buttons work on a game opened over the LAN or Tailscale (`debuff dev --host`). That's plain HTTP, where `navigator.clipboard` doesn't exist, and the buttons silently did nothing.
- `debuff scenario`: a game that throws while loading now fails that scenario with the error, instead of a 15 s timeout reported as an unexpected error. A game that loads but has no dev hooks gets the `dev_hooks_missing` error and its fix. A dev server whose config hides its local URL falls back to the network URL or its port.
