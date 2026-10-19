# spryte

## 0.1.2

### Patch Changes

- 3a328dd: npm description and README lead with the measured result and link 2dbench.

## 0.1.1

### Patch Changes

- 247d5a4: Fixes from an adversarial QA pass: a shader that fails to compile no longer breaks the renderer; `draw.sprites` clamps `count` to the arrays it's given (it used to draw nothing on WebGL2 when `count` was too large); Canvas 2D keeps smoothing correct after a clip; oversized or fractional render targets throw clearly; using a disposed `Draw` throws. README and benchmark docs now use the interleaved, parity-gated results: 2–3.8× faster than PixiJS 8 like for like (0.1.0's README overstated several cases).
