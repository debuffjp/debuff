# Using debuff without a build step

The runtime packages are plain ES modules with no dependencies, so any page can load them straight from a CDN with an [import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap). This suits prototypes, CodePen-style sketches, teaching and very small jam entries.

> Available from the first npm release. Pin an exact version in real projects.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script type="importmap">
      {
        "imports": {
          "@debuff/core": "https://cdn.jsdelivr.net/npm/@debuff/core@0.1/dist/index.js",
          "@debuff/input": "https://cdn.jsdelivr.net/npm/@debuff/input@0.1/dist/index.js",
          "@debuff/juice": "https://cdn.jsdelivr.net/npm/@debuff/juice@0.1/dist/index.js"
        }
      }
    </script>
    <style>
      html, body { margin: 0; height: 100%; background: #111; }
      main { position: fixed; inset: 0; display: grid; place-items: center; }
    </style>
  </head>
  <body>
    <main><canvas id="game"></canvas></main>
    <script type="module">
      import { Game } from "@debuff/core";
      import { Input } from "@debuff/input";

      const game = new Game({ canvas: document.querySelector("#game"), width: 320, height: 180 });
      const input = new Input(game, { bindings: { left: ["ArrowLeft"], right: ["ArrowRight"] } });
      let x = 160;

      game
        .add({
          id: "play",
          update(dt) {
            x += input.axis("left", "right") * 120 * dt;
          },
          render(draw) {
            draw.rect(x - 8, 120, 16, 16, "#cffb2d");
          },
        })
        .go("play");
      game.start();
    </script>
  </body>
</html>
```

## What you give up

| With the CLI | Without a build |
| --- | --- |
| Tree-shaking: you ship only what you import | Whole package modules are downloaded |
| Asset pipeline and manifest | Load assets yourself, or hand-write a manifest for `@debuff/assets` |
| Size report and dev-boundary check | None |
| `debuff scenario` tests and dev hooks | Not available |
| TypeScript | Plain JavaScript (types still help in editors via JSDoc) |

When the prototype outgrows a single file, `npm create debuff` gives you the full toolchain with the same APIs.
