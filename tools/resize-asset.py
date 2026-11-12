"""Downscale a cut-out portrait for the web and trim empty margins.

Usage:
    python tools/resize-asset.py <input.png> <output.png> [target height]
"""
from PIL import Image
import os
import sys

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(2)

SRC, DST = sys.argv[1], sys.argv[2]
TARGET_H = int(sys.argv[3]) if len(sys.argv) > 3 else 1200

os.makedirs(os.path.dirname(os.path.abspath(DST)), exist_ok=True)

im = Image.open(SRC).convert("RGBA")
# Trim empty margins first so the height budget goes to the figure itself.
box = im.getbbox()
if box:
    im = im.crop(box)

w, h = im.size
im = im.resize((max(1, round(w * TARGET_H / h)), TARGET_H), Image.LANCZOS)

im.save(DST, "PNG", optimize=True)
print("saved", DST, im.size, os.path.getsize(DST), "bytes")
