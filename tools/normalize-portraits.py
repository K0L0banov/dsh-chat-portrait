"""Normalise expression sheets onto one scale without forcing one crop window.

Two constraints pull against each other:

* Sheets that share a standing pose must stay pixel-aligned, so they must be
  scaled by the same factor.
* A sheet that changes the pose (kneeling, sitting) has a completely different
  silhouette; forcing it into a shared crop window would shrink every other
  sheet.

So each sheet is cropped to its own content box, but all of them are scaled by
one shared factor derived from the tallest sheet. A standing sheet fills the
figure height; a kneeling sheet naturally lands shorter, which is correct.
Per-expression `scale` / `offsetX` / `offsetY` in `portrait.json` absorb the
leftover differences in framing.

Drop sheets into `assets/source/` named after the emotion id (`happy.png`,
`sad.png`, …); everything else is derived.

Usage:
    python tools/normalize-portraits.py [figure height]
"""
from PIL import Image
import os
import sys

HEIGHT = int(sys.argv[1]) if len(sys.argv) > 1 else 1200

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))
SOURCE_DIR = os.path.join(ASSETS, 'source')
EXTENSIONS = {'.png', '.webp', '.jpg', '.jpeg'}

if not os.path.isdir(SOURCE_DIR):
    raise SystemExit(f'no source directory at {SOURCE_DIR}')

sheets = sorted(
    name for name in os.listdir(SOURCE_DIR)
    if os.path.splitext(name)[1].lower() in EXTENSIONS
)
if not sheets:
    raise SystemExit(f'{SOURCE_DIR} holds no images')

loaded = {}
tallest = 0
for name in sheets:
    path = os.path.join(SOURCE_DIR, name)
    image = Image.open(path).convert('RGBA')
    box = image.getbbox()
    if box is None:
        print(f'skip {name}: empty')
        continue
    emotion = os.path.splitext(name)[0]
    tile = image.crop(box)
    loaded[emotion] = tile
    tallest = max(tallest, tile.size[1])
    print(f'{emotion}: {image.size} -> content {box} => {tile.size}')

if not loaded:
    raise SystemExit('every sheet was empty')

# One factor for every sheet: the tallest one becomes HEIGHT.
scale = HEIGHT / tallest
print(f'reference height {tallest}px -> {HEIGHT}px (factor {scale:.4f})')

for emotion, tile in loaded.items():
    w, h = tile.size
    out_size = (max(1, round(w * scale)), max(1, round(h * scale)))
    tile = tile.resize(out_size, Image.LANCZOS)
    out = os.path.join(ASSETS, f'{emotion}.webp')
    # WebP keeps the alpha channel and lands near a third of the PNG size,
    # which matters once a dozen expression sheets are inlined into the manifest.
    tile.save(out, 'WEBP', quality=90, method=6)
    print(f'wrote {out} {tile.size} {os.path.getsize(out)} bytes')
