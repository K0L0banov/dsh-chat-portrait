"""Sync sheets from the desktop folder into assets/source under stable ids.

The owner names files in Chinese; the plugin addresses them by id. This keeps one
mapping in one place, so adding a portrait is: drop it in the folder, add a line
here, run this, then normalize + pack.

Usage:
    python tools/import-portraits.py          # copy mapped files
    python tools/import-portraits.py --list   # show what would happen
"""
from PIL import Image
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', 'assets'))
SOURCE = os.path.join(ASSETS, 'source')
DESKTOP = os.path.expanduser(r'~\Desktop\猫娘立绘')

# Chinese file name (without extension) -> stable id.
MAPPING = {
    '立绘-开衫-默认': 'neutral',
    '立绘-开衫-开心': 'happy',
    '立绘-开衫-兴奋': 'excited',
    '立绘-开衫-生气': 'angry',
    '立绘-开衫-害羞': 'shy',
    '立绘-开衫-害羞（坐姿）': 'shy_sit',
    '立绘-开衫-思考': 'thinking',
    '立绘-开衫-委屈': 'aggrieved',
    '立绘-开衫-慌乱': 'panic',
    '立绘-开衫-得意': 'proud',
    '立绘-开衫-傲娇': 'tsundere',
    '立绘-开衫-受到表扬（站姿）': 'praised',
    '立绘-开衫-受到表扬（坐姿）': 'praised_sit',
    '立绘-开衫-困倦': 'sleepy',
    '立绘-开衫-沮丧': 'sad',
    '立绘-开衫-乖巧': 'obedient',
    '立绘-开衫-困惑': 'puzzled',
    '立绘-开衫-要抱抱': 'hug',
}

# Deliberately not imported yet — outfits/scenes need a variant system first.
SKIP = {
    '三视图-开衫',
    '立绘-开衫-热牛奶-抱膝坐',
    '立绘-无开衫-热牛奶-侧坐',
    '立绘-无开衫裸足-热牛奶-侧坐',
}

EXT = {'.png', '.webp', '.jpg', '.jpeg'}
list_only = '--list' in sys.argv

if not os.path.isdir(DESKTOP):
    raise SystemExit(f'找不到桌面文件夹：{DESKTOP}')

os.makedirs(SOURCE, exist_ok=True)

copied, skipped, missing = [], [], []

for name in sorted(os.listdir(DESKTOP)):
    stem, ext = os.path.splitext(name)
    if ext.lower() not in EXT:
        continue
    if stem in SKIP:
        skipped.append(stem)
        continue
    target_id = MAPPING.get(stem)
    if target_id is None:
        missing.append(stem)
        continue
    src = os.path.join(DESKTOP, name)
    dst = os.path.join(SOURCE, target_id + '.png')
    if list_only:
        copied.append(f'{stem} -> {target_id}.png')
        continue
    image = Image.open(src)
    if image.mode != 'RGBA':
        image = image.convert('RGBA')
    image.save(dst, 'PNG', optimize=True)
    copied.append(f'{stem} -> {target_id}.png  {image.size}')

print(f'{"would copy" if list_only else "copied"} {len(copied)}')
for row in copied:
    print('  ' + row)
if skipped:
    print(f'skipped (needs variant system) {len(skipped)}')
    for row in skipped:
        print('  ' + row)
if missing:
    print(f'unmapped (add to MAPPING) {len(missing)}')
    for row in missing:
        print('  ' + row)
