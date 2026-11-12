"""Stitch the demo screenshots into one strip, cropping to the figure column."""
from PIL import Image, ImageDraw
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROBE = os.path.normpath(os.path.join(HERE, '..', '..', '_probe'))
OUT = os.path.join(PROBE, 'demo-strip.png')

frames = []
for index in range(8):
    path = os.path.join(PROBE, f'demo_{index}.png')
    if os.path.exists(path):
        frames.append(Image.open(path).convert('RGB'))

if not frames:
    raise SystemExit('no demo frames found')

# Keep the right-hand figure column, where the portrait lives.
CROP_W = 330
tiles = [frame.crop((frame.width - CROP_W, 0, frame.width, frame.height)) for frame in frames]

GAP = 6
LABEL_H = 26
width = PAD = 8
width = PAD * 2 + len(tiles) * CROP_W + GAP * (len(tiles) - 1)
height = tiles[0].height + LABEL_H
canvas = Image.new('RGB', (width, height), (18, 18, 20))
draw = ImageDraw.Draw(canvas)

x = PAD
for index, tile in enumerate(tiles):
    canvas.paste(tile, (x, LABEL_H))
    draw.text((x + 8, 7), f'frame {index}', fill=(200, 200, 210))
    x += CROP_W + GAP

canvas.save(OUT)
print('saved', OUT, canvas.size, 'frames', len(tiles))
