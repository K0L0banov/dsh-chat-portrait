"""Contact sheet of every source sheet, labelled, for pose triage."""
from PIL import Image, ImageDraw
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.normpath(os.path.join(HERE, '..', 'assets', 'source'))
OUT = os.path.join(HERE, 'pose-sheet.png')

COLS = 5
CELL_W = 230
CELL_H = 360
LABEL_H = 22
PAD = 8

names = sorted(
    os.path.splitext(name)[0]
    for name in os.listdir(SOURCE)
    if os.path.splitext(name)[1].lower() in {'.png', '.webp', '.jpg', '.jpeg'}
)
rows = (len(names) + COLS - 1) // COLS

canvas = Image.new('RGB', (PAD + COLS * (CELL_W + PAD), PAD + rows * (CELL_H + LABEL_H + PAD)), (24, 25, 28))
draw = ImageDraw.Draw(canvas)

for index, name in enumerate(names):
    path = None
    for ext in ('.png', '.webp', '.jpg', '.jpeg'):
        candidate = os.path.join(SOURCE, name + ext)
        if os.path.exists(candidate):
            path = candidate
            break
    if path is None:
        continue
    image = Image.open(path).convert('RGBA')
    image.thumbnail((CELL_W - 16, CELL_H - 16), Image.LANCZOS)
    col = index % COLS
    row = index // COLS
    x = PAD + col * (CELL_W + PAD)
    y = PAD + row * (CELL_H + LABEL_H + PAD)
    draw.text((x + 4, y + 4), name, fill=(220, 220, 230))
    canvas.paste(image, (x + (CELL_W - image.width) // 2, y + LABEL_H + (CELL_H - image.height) // 2), image)

canvas.save(OUT)
print('saved', OUT, canvas.size, 'sheets', len(names))
