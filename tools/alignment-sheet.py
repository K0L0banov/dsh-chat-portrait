"""Contact sheet: every expression bottom-aligned on one ground line.

Used to eyeball whether the sheets share a camera. Applies the same per-sheet
scale/offset that portrait.json asks for, so what you see matches the runtime.
"""
from PIL import Image
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))
OUT = os.path.join(ASSETS, '..', 'tools', 'alignment-check.png')

with open(os.path.join(ASSETS, 'portrait.json'), encoding='utf-8') as handle:
    manifest = json.load(handle)

order = ['neutral', 'happy', 'thinking', 'sad', 'sleepy']
GAP = 28
PAD = 28
GROUND = 24

tiles = []
for emotion in order:
    entry = manifest['emotions'].get(emotion)
    if not entry:
        continue
    source = os.path.join(ASSETS, f'{emotion}.webp')
    if not os.path.exists(source):
        continue
    image = Image.open(source).convert('RGBA')
    scale = float(entry.get('scale', 1))
    if scale != 1:
        image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)
    tiles.append((emotion, image, entry.get('offsetX', 0), entry.get('offsetY', 0)))

width = PAD * 2 + sum(tile.width for _, tile, _, _ in tiles) + GAP * (len(tiles) - 1)
height = PAD * 2 + GROUND + max(tile.height for _, tile, _, _ in tiles)
canvas = Image.new('RGBA', (width, height), (26, 27, 31, 255))

x = PAD
for _, image, dx, dy in tiles:
    canvas.alpha_composite(image, (x + dx, height - PAD - GROUND - image.height + dy))
    x += image.width + GAP

canvas.convert('RGB').save(OUT)
print('saved', OUT, canvas.size)
