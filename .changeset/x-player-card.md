---
"@debuffjp/cli": minor
---

`launch.playerCard` makes `debuff build` write an X player card, so the game can play inside a post. Set the X account and the iframe size:

```ts
launch: {
  url: "https://you.itch.io/game",
  playerCard: { site: "@you", width: 480, height: 270 },
},
```

The build then writes `twitter:card` `player` with `twitter:site`, `twitter:title`, `twitter:image` (the preview image), `twitter:player` (`launch.url`, or `playerCard.url` when the iframe page lives elsewhere), `twitter:player:width` and `twitter:player:height`. It fails with `config_invalid` instead of writing tags X would ignore: an account that isn't `@name`, a size that isn't a whole number of pixels, a player address that isn't https, no `launch.url` or no preview image. Without `playerCard` the card is the same as before: `summary_large_image` with a preview image, `summary` without. Before 0.32, the way to get a player card was to write the tags into `index.html` by hand or rewrite them after the build.
