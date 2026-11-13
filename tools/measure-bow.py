"""Estimate a per-sheet scale correction from the blue ribbon bow.

Generation drift means the same character comes out at slightly different
sizes. The ribbon bow is the most reliable shared ruler: always blue, always
at the neck, present in every sheet, and unaffected by pose or expression.

Prints a suggested `scale` per sheet so the figure reads the same size across
all of them.
"""
from PIL import Image
import numpy as np
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.normpath(os.path.join(HERE, '..', 'assets', 'source'))
EXT = {'.png', '.webp', '.jpg', '.jpeg'}

def bow_width(path):
    image = Image.open(path).convert('RGBA')
    a = np.asarray(image).astype(np.int16)
    r, g, b, alpha = a[..., 0], a[..., 1], a[..., 2], a[..., 3]

    solid = alpha > 40
    ys, xs = np.where(solid)
    if len(ys) == 0:
        return None
    top, bottom = ys.min(), ys.max()
    span = bottom - top

    # Blue-dominant and reasonably saturated: the bow, not the pale clothing.
    blue = (b > r + 30) & (b > 120) & (alpha > 200)
    # Restrict to the neck band, which is where the bow lives in every pose.
    band = blue & (np.arange(a.shape[0])[:, None] > top + span * 0.34) & (
        np.arange(a.shape[0])[:, None] < top + span * 0.62
    )
    bys, bxs = np.where(band)
    if len(bxs) < 30:
        return None
    width = float(np.percentile(bxs, 95) - np.percentile(bxs, 5))
    if width <= 4:
        return None
    return width, (top, bottom, span)

names = sorted(
    os.path.splitext(n)[0] for n in os.listdir(SOURCE) if os.path.splitext(n)[1].lower() in EXT
)
measured = {}
for name in names:
    path = next((os.path.join(SOURCE, name + e) for e in ('.png', '.webp', '.jpg', '.jpeg')
                 if os.path.exists(os.path.join(SOURCE, name + e))), None)
    if path is None:
        continue
    result = bow_width(path)
    if result is None:
        print(f'{name:12s} bow not found')
        continue
    width, _ = result
    measured[name] = width
    print(f'{name:12s} bow {width:6.1f}px')

if not measured:
    raise SystemExit('nothing measured')

# The standing default is the reference the whole set is eyeballed against.
reference = measured.get('neutral') or float(np.median(list(measured.values())))
print(f'\nreference (neutral) {reference:.1f}px')
print('suggested scale:')
for name in names:
    if name in measured:
        print(f'  "{name}": {reference / measured[name]:.3f}')
