# @debuff/juice

Game-feel building blocks: tweens, easing, pooled particles, trails and squash-and-stretch. No dependencies, and each export can be used on its own.

```ts
import { Particles, squash, Tweens } from "@debuff/juice";

const tweens = new Tweens();
const particles = new Particles(() => game.random.next()); // seeded, so captures are reproducible

// on impact
squash(tweens, player, 0.35);
particles.emit({ x, y, count: 16, colors: ["#ffd166", "#ef476f"], gravity: 200 });
game.camera.shake(0.3);
game.freeze(0.06); // hit-stop

// every step
tweens.update(dt);
particles.update(dt);
```

## API

- `Tweens`: `to(target, props, { duration, ease, delay, yoyo, repeat, onComplete })` → `{ done, cancel(), finished }`, `kill(target)`, `update(dt)`
- `ease`: `linear`, `in/out/inOutQuad`, `in/out/inOutCubic`, `outBack`, `outElastic`, `outBounce`
- `Particles`: `emit({ x, y, count, speed, angle, spread, life, size, sizeEnd, colors, gravity, drag, shape, additive })`, `update(dt)`, `draw(draw)`, `clear()`
- `Trail`: `push(x, y)`, `draw(draw)`, `clear()`
- `squash(tweens, target, amount?, duration?)`
