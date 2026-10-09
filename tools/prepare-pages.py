#!/usr/bin/env python3
"""
把单文件版同步到 docs/index.html，供 GitHub Pages 在线体验。

为什么需要这一步：
  GitHub Pages 只能从仓库根目录或 /docs 发布。如果把根目录当站点，
  src/ 与 tools/ 会全部变成可公开访问的静态文件，既没必要也容易误导。
  所以在线版放 docs/index.html，内容是单文件版的副本。

用法（改了源码之后按顺序跑）：
    node tools/bundle-standalone.mjs     # 重新打包单文件版
    python tools/prepare-pages.py        # 同步到 docs/index.html

写入范围：docs/index.html 与 docs/assets/paddle（新版识别资源）。
"""

from __future__ import annotations

import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'FoodLensCare-standalone.html'
TARGET = ROOT / 'docs' / 'index.html'

# 明确写出允许写入的唯一路径，避免手滑覆盖别的文件
ALLOWED_TARGETS = {TARGET.resolve()}

BANNER = """<!--
  ============================================================
  这是 GitHub Pages 的在线体验入口，由 tools/prepare-pages.py 自动生成。
  内容与仓库根目录的 FoodLensCare-standalone.html 完全一致。
  请不要直接编辑本文件 —— 改了会在下次同步时被覆盖。
  改源码 → node tools/bundle-standalone.mjs → python tools/prepare-pages.py
  ============================================================
-->
"""


def main() -> int:
    if not SOURCE.exists():
        print('找不到单文件版，请先运行：node tools/bundle-standalone.mjs')
        return 1

    if TARGET.resolve() not in ALLOWED_TARGETS:
        print('目标路径不在允许列表里，已中止。')
        return 1

    html = SOURCE.read_text(encoding='utf-8')

    # 把生成说明插在 <!DOCTYPE html> 之后，让第一个打开源码的人立刻看懂
    marker = '<!DOCTYPE html>'
    if html.startswith(marker):
        html = marker + '\n' + BANNER + html[len(marker) + 1 :]
    else:
        html = BANNER + html

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(html, encoding='utf-8')
    # 在线版与源码版共用固定版本 OCR 引擎和语言模型。
    shutil.copytree(ROOT / 'assets' / 'paddle', TARGET.parent / 'assets' / 'paddle', dirs_exist_ok=True)

    same = html.endswith('</html>\n') or html.rstrip().endswith('</html>')
    size_kb = round(len(html.encode('utf-8')) / 1024)
    print('已同步到在线体验入口')
    print(f'  源文件：{SOURCE.name}')
    print(f'  目标：  {TARGET.relative_to(ROOT)}')
    print(f'  体积：  {size_kb} KB')
    print(f'  结构完整：{"是" if same else "存疑，请检查"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
