"""Render standing vs kneeling exactly as the widget lays them out.

Mirrors the runtime geometry: the figure column is COL_W wide and COL_H tall,
each sheet is contained inside it, then the per-sheet scale is applied around
the bottom-centre anchor. A ground line marks the shared baseline.
"""
from PIL import Image, ImageDraw
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))
OUT = os.path.join(HERE, 'ground-check.png')

COL_W = 272
COL_H = 627
GROUND_PAD = 24
PAD = 26

with open(os.path.join(ASSETS, 'portrait.json'), encoding='utf-8') as handle:
    manifest = json.load(handle)

order = ['neutral', 'happy', 'thinking', 'sad', 'sleepy']

def layout(emotion):
    entry = manifest['emotions'][emotion]
    image = Image.open(os.path.join(ASSETS, f'{emotion}.webp')).convert('RGBA')
    scale = float(entry.get('scale', 1))
    fit = min(COL_W / image.width, COL_H / image.height)
    w = max(1, round(image.width * fit))
    h = max(1, round(image.height * fit))
    image = image.resize((w, h), Image.LANCZOS)
    if scale != 1:
        image = image.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    return image

tiles = [(name, layout(name)) for name in order]

cell_w = max(max(tile.width for _, tile in tiles), COL_W) + PAD
canvas_w = cell_w * len(tiles)
canvas_h = COL_H + GROUND_PAD + PAD * 2
canvas = Image.new('RGBA', (canvas_w, canvas_h), (22, 23, 26, 255))
draw = ImageDraw.Draw(canvas)

baseline = canvas_h - PAD - GROUND_PAD
draw.line([(0, baseline), (canvas_w, baseline)], fill=(255, 90, 90, 255), width=2)

for index, (name, tile) in enumerate(tiles):
    cell_x = index * cell_w
    cx = cell_x + cell_w / 2
    canvas.alpha_composite(tile, (round(cx - tile.width / 2), baseline - tile.height))
    draw.text((cell_x + 10, 8), f'{name}  h={tile.height}', fill=(210, 210, 220, 255))

canvas.convert('RGB').save(OUT)
print('saved', OUT, canvas.size)
