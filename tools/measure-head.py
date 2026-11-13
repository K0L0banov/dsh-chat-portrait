"""Estimate a per-sheet scale correction from the head silhouette.

Generation drift makes the same character come out at slightly different sizes.
The ribbon bow is influenced by pose, so this measures the head instead: take
the top band of the content box, measure the opaque width of each row there,
and use the median so decorations (hearts, sparkles) are filtered out.

Run after adding sheets, then paste the suggested scales into portrait.json.
"""
from PIL import Image
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.normpath(os.path.join(HERE, '..', 'assets', 'source'))
EXT = {'.png', '.webp', '.jpg', '.jpeg'}

# Head band as a fraction of the content height. The head occupies the top of
# every sheet, standing or kneeling.
BAND_TOP = 0.10
BAND_BOTTOM = 0.38

def head_width(path):
    image = Image.open(path).convert('RGBA')
    a = np.asarray(image)
    alpha = a[..., 3]
    solid = alpha > 40
    ys, xs = np.where(solid)
    if len(ys) == 0:
        return None
    top, bottom = ys.min(), ys.max()
    span = bottom - top
    y0 = int(top + span * BAND_TOP)
    y1 = int(top + span * BAND_BOTTOM)

    widths = []
    for y in range(y0, y1):
        row = np.where(solid[y])[0]
        if len(row) > 4:
            widths.append(row.max() - row.min())
    if not widths:
        return None
    return float(np.median(widths))

names = sorted(
    os.path.splitext(n)[0] for n in os.listdir(SOURCE) if os.path.splitext(n)[1].lower() in EXT
)
measured = {}
for name in names:
    path = next((os.path.join(SOURCE, name + e) for e in ('.png', '.webp', '.jpg', '.jpeg')
                 if os.path.exists(os.path.join(SOURCE, name + e))), None)
    if path is None:
        continue
    width = head_width(path)
    if width is None:
        print(f'{name:12s} no head found')
        continue
    measured[name] = width
    print(f'{name:12s} head {width:6.1f}px')

if not measured:
    raise SystemExit('nothing measured')

reference = measured.get('neutral') or float(np.median(list(measured.values())))
print(f'\nreference (neutral) {reference:.1f}px')
print('suggested scale:')
for name in names:
    if name in measured:
        print(f'  {name:12s} {reference / measured[name]:.3f}')
