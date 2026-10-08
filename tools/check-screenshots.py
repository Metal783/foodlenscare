"""检查截图的右边界：统计每列的非背景像素，判断内容是否溢出画面。"""
import sys
from PIL import Image

for path in sys.argv[1:]:
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    # 背景色 #F4F7FA = (244,247,250)
    bg = (244, 247, 250)
    threshold = 12

    def is_bg(c):
        return all(abs(c[i] - bg[i]) <= threshold for i in range(3))

    # 逐列统计非背景像素数
    col_counts = []
    for x in range(w):
        n = 0
        for y in range(0, h, 3):
            if not is_bg(px[x, y]):
                n += 1
        col_counts.append(n)

    non_empty = [x for x, n in enumerate(col_counts) if n > 0]
    right = max(non_empty) if non_empty else -1
    # 右边缘最后 24 列里是否仍有大量内容（说明被裁切）
    tail = sum(col_counts[max(0, w - 12):])
    print(f'{path}')
    print(f'  size={w}x{h}  内容最右列={right}  右边缘12列非背景像素={tail}')
    # 找出每一行的最右内容，看是否存在"贴边"的行
    stuck = 0
    for y in range(0, h, 4):
        last = -1
        for x in range(w - 1, -1, -1):
            if not is_bg(px[x, y]):
                last = x
                break
        if last >= w - 3:
            stuck += 1
    print(f'  贴边的扫描行数={stuck}（总扫描行 {len(range(0, h, 4))}）')
