"""为 52 张生成图纸制作多种尺寸（V5.4）。

原生图纸 src/generated-patterns.json 保持不变；本脚本从同一张高清图集重新取样，
输出 src/generated-pattern-variants.json：每张图纸若干尺寸，颜色只用该图纸原生的调色板，
所以换尺寸后色号不变。缩小时深色描边优先保留；放大时从原图取更多细节（嘴、腮红、籽等）。

每个尺寸都会：去掉 1–2 颗的孤立碎点、把分离的部分用最短路径连成一块（四向连通，才能烫成整体）、
四周留一格空位。数据按“调色板下标字符”压缩：'.' 为空，'a' 起为调色板颜色。
"""
from pathlib import Path
from collections import deque
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'reference/generated-patterns'
# 精灵图主体的最长边（不含四周各 1 格空位）。板格 = 最长边 + 2。原生为 44。
SIDES = [14, 18, 22, 28, 34, 38, 46, 54, 62]
SHEETS = {'animals': 4, 'desserts': 4, 'fantasy': 4, 'floral': 2}
ALPHA = 160


def components(cells, w, h, diagonals=False):
    unseen = {i for i, c in enumerate(cells) if c is not None}
    steps = ((1, 0), (-1, 0), (0, 1), (0, -1)) + (((1, 1), (1, -1), (-1, 1), (-1, -1)) if diagonals else ())
    out = []
    while unseen:
        start = unseen.pop(); group = [start]; todo = deque([start])
        while todo:
            i = todo.popleft(); x, y = i % w, i // w
            for dx, dy in steps:
                xx, yy = x + dx, y + dy; j = yy * w + xx
                if 0 <= xx < w and 0 <= yy < h and j in unseen:
                    unseen.remove(j); group.append(j); todo.append(j)
        out.append(group)
    return sorted(out, key=len, reverse=True)


def sprite_tile(atlas, n, index):
    """与 prepare_generated_patterns.py 相同的裁切：去掉越界的邻格碎片，裁到内容边界。"""
    col, row = index % n, index // n
    tile = atlas.crop((round(col * atlas.width / n), round(row * atlas.height / n), round((col + 1) * atlas.width / n), round((row + 1) * atlas.height / n)))
    alpha = tile.getchannel('A').point(lambda a: 255 if a >= ALPHA else 0)
    values = list(alpha.getdata())
    regions = components([1 if v else None for v in values], tile.width, tile.height, True)
    for region in regions[1:]:
        if len(region) < len(regions[0]) * .07:
            for at in region: values[at] = 0
    alpha.putdata(values)
    tile.putalpha(alpha)
    return tile.crop(alpha.getbbox())


def hex_rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)


def resample(tile, side, palette):
    arr = np.asarray(tile.convert('RGBA')).astype(float)
    th, tw = arr.shape[:2]
    scale = side / max(tw, th)
    w, h = max(1, round(tw * scale)), max(1, round(th * scale))
    pal = np.stack([hex_rgb(p) for p in palette])
    lum = pal @ np.array([.299, .587, .114]) / 255
    dark = lum < .22
    # 每个原图像素先归到调色板中最近的颜色（加权 RGB 距离）。
    rgb = arr[:, :, :3]
    weights = np.array([.30, .59, .11])
    dist = (((rgb[:, :, None, :] - pal[None, None, :, :]) ** 2) * weights).sum(axis=3)
    nearest = dist.argmin(axis=2)
    opaque = arr[:, :, 3] >= ALPHA
    cells = [None] * (w * h)
    for y in range(h):
        y0, y1 = int(y * th / h), max(int(y * th / h) + 1, int(np.ceil((y + 1) * th / h)))
        for x in range(w):
            x0, x1 = int(x * tw / w), max(int(x * tw / w) + 1, int(np.ceil((x + 1) * tw / w)))
            block = opaque[y0:y1, x0:x1]
            if block.mean() < .45:
                continue
            counts = np.bincount(nearest[y0:y1, x0:x1][block], minlength=len(palette))
            total = counts.sum()
            dark_counts = np.where(dark, counts, 0)
            # 描边、眼睛等深色细节优先：占到约四分之一就保留下来，缩小后描边不断。
            if dark_counts.sum() >= total * (.26 if side < 44 else .34):
                cells[y * w + x] = int(dark_counts.argmax())
            else:
                cells[y * w + x] = int(counts.argmax())
    return cells, w, h


def cleanup(cells, w, h):
    for group in components(cells, w, h, True)[1:]:
        if len(group) <= 2:
            for i in group: cells[i] = None
    groups = components(cells, w, h)
    while len(groups) > 1:
        main, other = groups[0], groups[1]
        a, b = min(((a, b) for a in main for b in other), key=lambda p: abs(p[0] % w - p[1] % w) + abs(p[0] // w - p[1] // w))
        x, y = a % w, a // w; tx, ty = b % w, b // w
        while (x, y) != (tx, ty):
            if x != tx: x += 1 if tx > x else -1
            else: y += 1 if ty > y else -1
            at = y * w + x
            if cells[at] is None: cells[at] = cells[a]
        groups = components(cells, w, h)
    return cells


def main():
    native = json.loads((ROOT / 'src/generated-patterns.json').read_text(encoding='utf-8'))
    atlases = {name: Image.open(ASSETS / f'{name}.png').convert('RGBA') for name in SHEETS}
    out = {}
    for pattern in native:
        src = pattern['source']
        group = src['atlas'].removesuffix('.png')
        tile = sprite_tile(atlases[group], SHEETS[group], src['tile'] - 1)
        palette = sorted(set(c for c in pattern['cells'] if c))
        variants = []
        for side in SIDES:
            cells, w, h = resample(tile, side, palette)
            cells = cleanup(cells, w, h)
            width, height = w + 2, h + 2
            rows = []
            for y in range(height):
                row = []
                for x in range(width):
                    inside = 1 <= x <= w and 1 <= y <= h
                    value = cells[(y - 1) * w + (x - 1)] if inside else None
                    row.append('.' if value is None else chr(97 + value))
                rows.append(''.join(row))
            data = ''.join(rows)
            variants.append({'w': width, 'h': height, 'd': data, 'beads': sum(ch != '.' for ch in data)})
        out[pattern['id']] = {'palette': palette, 'variants': variants}
    (ROOT / 'src/generated-pattern-variants.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'patterns': len(out), 'sizes': SIDES, 'bytes': (ROOT / 'src/generated-pattern-variants.json').stat().st_size,
                      'example': {v['w']: v['beads'] for v in out[native[0]['id']]['variants']}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
