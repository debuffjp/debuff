---
"spryte": patch
---

Shared mode (`createSharedRenderer`, `spryte/phaser`): recover from a WebGL context loss that is restored before spryte's next frame. spryte polled `isContextLost()` at `begin()`, so a loss and restore between two frames went unnoticed and it kept using objects of the dead context. It now notes both events (without claiming them from the host) and rebuilds at the next `begin()`.
