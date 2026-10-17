# @debuffjp/ui

The screens around your game: fades between areas, title and pause menus, framed panels. No dependencies, and each export can be used on its own. Everything runs on `update(dt)`, so replays and scenarios stay deterministic.

```ts
import { Menu, Transition } from "@debuffjp/ui";

const fade = new Transition({ duration: 0.35, color: "#1a1020" });
let volume = 10;
const pause = new Menu(
  [
    { label: "resume", onSelect: () => (paused = false) },
    { label: "volume", value: () => `${volume}`, change: (d) => (volume = Math.max(0, Math.min(10, volume + d))) },
    { label: "restart", onSelect: () => fade.run(reset) },
  ],
  { actions: { up: "up", down: "down", confirm: "jump", back: "pause", left: "left", right: "right" } },
);

// every step
fade.update(dt);
if (fade.blocking) return;
if (paused) pause.update(input);

// render, after the world
if (paused) pause.drawPanel(draw, game.width / 2, game.height / 2, { title: "paused" });
fade.draw(draw, 0, 0, game.width, game.height);
```

## Layout

Text is measured with `draw.measure`, so nothing is positioned by guesswork:

- The cursor has its own column. Labels never shift when focus moves.
- Values (`value: () => string`) are right-aligned in a column of their own.
- `drawPanel` centres the frame on a point, mirrors the cursor column so the labels and the title share a centre, and pads evenly on all sides.
- Every position snaps to whole pixels, so pixel fonts stay crisp.

## API

- `Transition`: `run(swap?)` → covers the screen, calls `swap` once fully covered, then uncovers. `update(dt)`, `draw(draw, x, y, w, h)`, `stop()`, `active`, `blocking`, `cover`, `inspect()`
- `Menu`: `new Menu(items, { actions, onBack, wrap })`, `update(input)` (with `input.pointer`, a tap selects the row under it; on a value row the left half lowers and the right half raises), `tap(x, y)`, `move(delta)`, `select()`, `measure(draw, style)`, `draw(draw, x, y, style)`, `drawPanel(draw, cx, cy, style)`, `focused`, `inspect()`
  - items: `{ label, onSelect?, disabled?, value?, change? }`
  - style: `font`, `color`, `focusColor`, `disabledColor`, `gap` (3), `align` (`left`/`center`), `cursor` (`>`), `cursorGap` (4), `valueGap` (12); panel adds `title`, `titleFont`, `titleColor`, `titleGap` (6), `borders`, `fill`, `padding` (6)
- `panel(draw, x, y, w, h, borders, fill?)`: 1px rings, outermost first, then the fill
- `panelAround(draw, cx, cy, w, h, { borders, fill, padding })`: a panel fitted around content, centred and pixel-snapped; returns the content's top-left

Colours and fonts are yours to choose; the defaults are plain greys.
