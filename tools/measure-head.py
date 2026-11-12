"""Prove the ground line and body scale with measured anchors.

For every sheet it reports, in source pixels:
  * ground  — the lowest opaque row (feet / cushion)
  * eyes    — the pupil row
  * crown   — the topmost opaque row
then the two ratios that decide whether a kneeling pose reads as "same person,
lower head" or as "shrunk character":

  eye height ratio = eyes-to-ground / standing eye height   (should be ~0.55-0.62)
  head ratio       = crown-to-eyes / standing head height    (should be ~1.0)
"""
from PIL import Image
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.normpath(os.path.join(HERE, '..', 'assets', 'source'))
SHEETS = ['neutral', 'happy', 'thinking', 'sad', 'sleepy']

def anchors(path):
    image = Image.open(path).convert('RGBA')
    a = np.asarray(image).astype(np.int16)
    r, g, b, alpha = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    solid = alpha > 24
    ys, xs = np.where(solid)
    if len(ys) == 0:
        return None
    ground = int(ys.max())
    crown = int(ys.min())

    mask = (b > r + 35) & (b > 110) & (b < 230) & (r < 150) & (alpha > 200)
    pys, pxs = np.where(mask)
    eyes = float(pys.mean()) if len(pys) else None
    return {'ground': ground, 'crown': crown, 'eyes': eyes, 'h': image.size[1]}

measured = {}
for name in SHEETS:
    path = os.path.join(SOURCE, f'{name}.png')
    if not os.path.exists(path):
        continue
    measured[name] = anchors(path)

ref_eye = None
ref_head = None
for name in ('neutral', 'thinking'):
    m = measured.get(name)
    if m and m['eyes'] is not None:
        ref_eye = m['ground'] - m['eyes'] if ref_eye is None else (ref_eye + (m['ground'] - m['eyes'])) / 2
        head = m['eyes'] - m['crown']
        ref_head = head if ref_head is None else (ref_head + head) / 2

print(f'reference standing: eye-to-ground {ref_eye:.1f}px, head {ref_head:.1f}px\n')
print(f"{'sheet':10s} {'ground':>7s} {'crown':>7s} {'eyes':>7s} {'eye/ground':>11s} {'head':>7s} {'head ratio':>11s} {'=> scale':>10s}")
for name in SHEETS:
    m = measured.get(name)
    if not m:
        continue
    if m['eyes'] is None:
        print(f'{name:10s} (no pupils)')
        continue
    eye_h = m['ground'] - m['eyes']
    head = m['eyes'] - m['crown']
    print(
        f"{name:10s} {m['ground']:7d} {m['crown']:7d} {m['eyes']:7.1f} "
        f"{eye_h / ref_eye:11.3f} {head:7.1f} {head / ref_head:11.3f} {ref_head / head:10.3f}"
    )
