"""Compare candidate scale corrections for the kneeling sheets.

The standing sheet sets the reference head size. Each variant below applies a
different `scale` to the kneeling sheet, all on the same ground line, so the
trade-off between "same person size" and "how much the wide knees overflow the
reserved column" is visible at a glance.
"""
from PIL import Image, ImageDraw
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))
OUT = os.path.join(HERE, 'scale-compare.png')

COL_W = 272
COL_H = 627
PAD = 26
GROUND_PAD = 26

with open(os.path.join(ASSETS, 'portrait.json'), encoding='utf-8') as handle:
    manifest = json.load(handle)

def rendered(emotion, scale=None):
    entry = manifest['emotions'][emotion]
    image = Image.open(os.path.join(ASSETS, f'{emotion}.webp')).convert('RGBA')
    factor = float(entry.get('scale', 1)) if scale is None else scale
    fit = min(COL_W / image.width, COL_H / image.height)
    w = max(1, round(image.width * fit))
    h = max(1, round(image.height * fit))
    image = image.resize((w, h), Image.LANCZOS)
    if factor != 1:
        image = image.resize((max(1, round(w * factor)), max(1, round(h * factor))), Image.LANCZOS)
    return image

sheets = [
    ('standing', rendered('neutral', 1)),
    ('kneel x1.25', rendered('sad', 1.25)),
    ('kneel x1.45', rendered('sad', 1.45)),
    ('kneel x1.65', rendered('sad', 1.65)),
    ('kneel x1.85', rendered('sad', 1.85)),
]

cell_w = max(max(tile.width for _, tile in sheets), COL_W) + PAD * 2
canvas_w = cell_w * len(sheets)
canvas_h = COL_H + GROUND_PAD + PAD * 2
canvas = Image.new('RGBA', (canvas_w, canvas_h), (22, 23, 26, 255))
draw = ImageDraw.Draw(canvas)

baseline = canvas_h - PAD - GROUND_PAD
draw.line([(0, baseline), (canvas_w, baseline)], fill=(255, 90, 90, 255), width=2)

for index, (label, tile) in enumerate(sheets):
    cx = index * cell_w + cell_w / 2
    canvas.alpha_composite(tile, (round(cx - tile.width / 2), baseline - tile.height))
    draw.text((index * cell_w + 10, 8), f'{label}  {tile.width}x{tile.height}', fill=(210, 210, 220, 255))

canvas.convert('RGB').save(OUT)
print('saved', OUT, canvas.size)
