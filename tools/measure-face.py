"""Estimate a per-sheet scale correction from face width.

Generation drift makes the same character come out at slightly different sizes.
The ribbon bow shifts with pose, so this measures the face instead: detect the
pale-pink skin band around the eyes and use its median width. Hair and
decorations are excluded by the colour test.

Run after adding sheets, then paste the suggested scales into portrait.json.
"""
from PIL import Image
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.normpath(os.path.join(HERE, '..', 'assets', 'source'))
EXT = {'.png', '.webp', '.jpg', '.jpeg'}

# Eye band as a fraction of content height. Above this is forehead/hair,
# below it is chin and neck.
BAND_TOP = 0.14
BAND_BOTTOM = 0.34

def face_width(path):
    image = Image.open(path).convert('RGBA')
    a = np.asarray(image).astype(np.int16)
    r, g, b, alpha = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    solid = alpha > 40
    ys, xs = np.where(solid)
    if len(ys) == 0:
        return None
    top, bottom = ys.min(), ys.max()
    span = bottom - top
    y0 = int(top + span * BAND_TOP)
    y1 = int(top + span * BAND_BOTTOM)

    # Pale pink skin: red leads, everything is bright but not pure white.
    skin = (
        (r >= 228) & (g >= 200) & (g < 250) & (b >= 190) &
        (r - g >= 4) & (g - b >= -2) & (r - b >= 10) & (b < 245)
    )

    widths = []
    for y in range(y0, y1):
        row = np.where(skin[y] & solid[y])[0]
        if len(row) > 6:
            widths.append(row.max() - row.min())
    if not widths:
        # Fall back to the silhouette width if the skin test finds nothing.
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
    width = face_width(path)
    if width is None:
        print(f'{name:12s} no face found')
        continue
    measured[name] = width
    print(f'{name:12s} face {width:6.1f}px')

if not measured:
    raise SystemExit('nothing measured')

reference = measured.get('neutral') or float(np.median(list(measured.values())))
print(f'\nreference (neutral) {reference:.1f}px')
print('suggested scale:')
for name in names:
    if name in measured:
        print(f'  "{name}": {reference / measured[name]:.3f}')
