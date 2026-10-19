---
"@debuffjp/ui": minor
"@debuffjp/dev": minor
"create-debuff": minor
---

The "squish" look everywhere:

- **ui:** panels and menus that set no frame of their own get round corners, no outline, light labels, lime focus and a jelly highlight that squashes when focus moves (`debuffFrame` is this look; `FrameStyle.radius` is new). Styles that set their own borders or fill are untouched.
- **dev panel:** soft rounded panel, pill buttons and tabs, controls that squash on press, round toggles and sliders.
- **CLI:** buff is flat with dot eyes, and squashes when a command succeeds.
- **basic template:** buff is a flat jelly block with pill eyes, little feet, an idle jiggle and a hop on pop.
