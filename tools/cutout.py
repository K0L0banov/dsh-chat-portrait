"""Cut a white studio background out of a portrait.

Usage:
    python tools/cutout.py <input.png> <output.png> [tolerance]

Only the white region *connected to the border* is cleared, so enclosed white
areas (cardigan, hair highlights, socks) stay opaque. This matters for pale
characters: a plain threshold would punch holes through the subject.
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import sys

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(2)

SRC, OUT = sys.argv[1], sys.argv[2]
TOL = int(sys.argv[3]) if len(sys.argv) > 3 else 6

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.int16)
h, w, _ = a.shape

# Sample the background from the corners instead of assuming pure white.
corners = np.array([a[0, 0], a[0, w - 1], a[h - 1, 0], a[h - 1, w - 1]], dtype=np.int16)
bg = corners.mean(axis=0).round().astype(np.int16)
print("background sample", tuple(int(v) for v in bg))

candidate = np.abs(a - bg).max(axis=2) <= TOL
mask = Image.fromarray(np.where(candidate, 255, 0).astype(np.uint8), mode="L").copy()
for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
    ImageDraw.floodfill(mask, seed, 128, thresh=0)

outside = np.asarray(mask, dtype=np.uint8) == 128
print("cleared", round(float(outside.mean()) * 100, 1), "% of pixels")

alpha = np.where(outside, 0, 255).astype(np.uint8)
alpha = np.asarray(
    Image.fromarray(alpha, mode="L").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8)),
    dtype=np.uint8,
)

Image.fromarray(np.dstack([np.asarray(im, dtype=np.uint8), alpha]), mode="RGBA").save(OUT)
print("saved", OUT)
