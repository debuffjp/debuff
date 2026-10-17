# @debuffjp/ui

The screens around your game: fades between areas, title and pause menus, framed panels. No dependencies, and each export can be used on its own. Everything runs on `update(dt)`, so replays and scenarios stay deterministic.

```ts
import { Menu, panel, Transition } from "@debuffjp/ui";

const fade = new Transition({ duration: 0.35, color: "#1a1020" });
const pause = new Menu(
  [
    { label: "resume", onSelect: () => (paused = false) },
    { label: "restart", onSelect: () => fade.run(reset) },
  ],
  { actions: { up: "up", down: "down", confirm: "jump", back: "pause" }, onBack: () => (paused = false) },
);

// every step
fade.update(dt);
if (fade.blocking) return;
if (paused) pause.update(input);

// render, after the world
if (paused) {
  panel(draw, 80, 40, 160, 60, ["#fff", "#000"], "#222");
  pause.draw(draw, 160, 52, { align: "center" });
}
fade.draw(draw, 0, 0, game.width, game.height);
```

## API

- `Transition`: `run(swap?)` → covers the screen, calls `swap` once fully covered, then uncovers. `update(dt)`, `draw(draw, x, y, w, h)`, `stop()`, `active`, `blocking`, `cover`, `inspect()`
- `Menu`: `new Menu(items, { actions, onBack, wrap })`, `update(input)`, `move(delta)`, `select()`, `draw(draw, x, y, { font, color, focusColor, disabledColor, lineHeight, align, cursor })`, `focused`, `inspect()`
- `panel(draw, x, y, w, h, borders, fill?)`: 1px rings, outermost first, then the fill

Colours and fonts are yours to choose; the defaults are plain greys.
