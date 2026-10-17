-- Creates a blank bitmap-font sheet for debuff: one cell per printable ASCII character
-- (space to "~", 16 per row), with Aseprite's grid set to the cell size.
--
--   aseprite -b --script-param w=6 --script-param h=9 --script-param out=assets/font.aseprite --script new-font.lua
--
-- Draw each glyph from the cell's left edge; debuff measures widths from the rightmost
-- opaque column. Export with:  aseprite -b assets/font.aseprite --save-as assets/font@6x9.png
-- then: new BitmapFont({ frames: assets.frames("font"), chars: BitmapFont.ASCII })

local w = tonumber(app.params["w"] or "6")
local h = tonumber(app.params["h"] or "9")
local out = app.params["out"] or "font.aseprite"
local cols, count = 16, 95
local rows = math.ceil(count / cols)

local sprite = Sprite(w * cols, h * rows, ColorMode.RGB)
sprite.gridBounds = Rectangle(0, 0, w, h)
sprite.layers[1].name = "glyphs"

-- A hidden guide layer: a dot in each cell's top-left marks where a character goes.
local guide = sprite:newLayer()
guide.name = "guide (hidden)"
guide.isVisible = false
local img = Image(sprite.width, sprite.height, ColorMode.RGB)
for i = 0, count - 1 do
  img:drawPixel((i % cols) * w, (i // cols) * h, app.pixelColor.rgba(255, 0, 255, 255))
end
sprite:newCel(guide, 1, img, Point(0, 0))

sprite:saveAs(out)
