#!/usr/bin/env python3
"""
单文件版截图与校验

两件事：
  1. 校验（默认）：证明 FoodLensCare-standalone.html 在 file:// 下真的能跑，
     不需要任何服务器——这是「双击就能打开」这个承诺的证据；
  2. 截图（--shot）：出图做视觉核对。

为什么两条路径不一样：
  无头浏览器在 file:// 下会把 iframe 放进独立进程（站点隔离），父页面读不到内容，
  也常常渲染不出来，所以截图不能走 file:// 的 iframe 套壳。
  截图的正确做法是让应用在 390×844 的 iframe 里排版、再由外层按手机尺寸裁剪；
  为此这里临时起一个只监听本机的静态服务，截完立刻关掉。

用法：
    python tools/check-standalone.py                # 只做渲染校验
    python tools/check-standalone.py --shot docs/screenshots/standalone-red.png --to "/result?case=peanut-cookie" --profile allergy
"""

from __future__ import annotations

import argparse
import functools
import http.server
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # 截图时才需要 Pillow
    Image = None  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
STANDALONE = ROOT / 'FoodLensCare-standalone.html'
HARNESS = ROOT / '_qa' / 'shot-standalone.html'

BROWSER_CANDIDATES = [
    Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'),
    Path(r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'),
    Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
    Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'),
]

# (说明, hash 路由, 画像预设, 期望在页面上看到的关键词)
CHECKS: list[tuple[str, str, str | None, list[str]]] = [
    ('首页：拍包装', '/home', None, ['食护家', '拍一张照片', '从相册里选一张']),
    ('画像设置第一屏', '/onboarding', None, ['您今年多大岁数', '下一步']),
    ('结果页：红色', '/result?case=peanut-cookie', 'allergy', ['红色', '别吃', '花生']),
    ('结果页：橙色', '/result?case=sugar-drink', None, ['要当心', '这个太甜了']),
    ('结果页：灰色', '/result?case=blurry-photo', None, ['看不清', '能再拍一张吗']),
    ('结果页：绿色', '/result?case=plain-milk', None, ['可以吃']),
    ('适老化自检页', '/help', None, ['适老化对照表', '对比度']),
]


def find_browser() -> Path:
    for path in BROWSER_CANDIDATES:
        if path.exists():
            return path
    found = shutil.which('msedge') or shutil.which('chrome')
    if found:
        return Path(found)
    raise SystemExit('找不到 Edge 或 Chrome。')


def file_url(harness: Path, to: str, profile: str | None) -> str:
    query = {'to': to, '_': '1'}
    if profile:
        query['profile'] = profile
    return harness.as_uri() + '?' + urllib.parse.urlencode(query)


def dump_dom(browser: Path, url: str, workdir: Path, tag: str) -> str:
    """让浏览器把 DOM 写到文件，再按 UTF-8 读回来。

    不用 capture_output：Windows 上管道的默认编码会按系统代码页走，
    中文内容会被写坏，导致关键词校验全部误报失败。
    """
    out = workdir / f'{tag}.out'
    err = workdir / f'{tag}.err'
    args = [
        str(browser),
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--allow-file-access-from-files',
        f'--user-data-dir={workdir / ("profile-" + tag)}',
        '--window-size=520,900',
        '--virtual-time-budget=9000',
        '--dump-dom',
        url,
    ]
    subprocess.run(args, stdout=out.open('wb'), stderr=err.open('wb'), timeout=120)
    if not out.exists():
        return ''
    return out.read_text(encoding='utf-8', errors='replace')


def visible_text(dom: str) -> str:
    """把 iframe 之外的外壳去掉，只留页面文本用于关键词检查。

    注意：--dump-dom 不会带出 iframe 内部内容，所以这里改为直接渲染单文件本身
    （不走 iframe）来做文本校验；截图才走 iframe 以保证手机宽度。
    """
    return dom


def run_checks(browser: Path, workdir: Path) -> int:
    print('校验单文件版在 file:// 下能否正常运行：\n')
    failed = 0

    for note, route, profile, keywords in CHECKS:
        query = {'_': '1'}
        if profile:
            query['profile'] = profile
        # 直接打开单文件（不经 iframe），这样 --dump-dom 能拿到渲染结果
        url = STANDALONE.as_uri() + '?' + urllib.parse.urlencode(query) + '#' + route
        dom = dump_dom(browser, url, workdir, tag=route.strip('/').replace('/', '_').replace('?', '_') or 'home')

        # 只看渲染出来的文本：脚本里内嵌的提示语不能算作页面内容
        rendered = re.sub(r'<script[\s\S]*?</script>', ' ', dom)
        rendered = re.sub(r'<style[\s\S]*?</style>', ' ', rendered)

        boot_ok = '__FLC_BOOT__' in dom
        crash = '打开的时候出了点问题' in rendered
        empty_view = re.search(r'<main id="view"[^>]*>\s*</main>', rendered) is not None
        missing = [k for k in keywords if k not in rendered]

        status = '✅'
        if crash or missing or empty_view or not boot_ok:
            status = '❌'
            failed += 1
        print(f'  {status} {note}')
        if crash:
            detail = re.search(r'class="error-box">([^<]*)<', rendered)
            print(f'     页面给出启动失败提示：{detail.group(1) if detail else "（无细节）"}')
        if empty_view:
            print('     #view 为空，说明脚本没有渲染出内容')
        if missing:
            print(f'     缺少预期文案：{"、".join(missing)}')

    print()
    if failed:
        print(f'{failed} 项未通过。')
    else:
        print('全部通过：单文件版不依赖服务器即可完整运行。')
    return failed


def take_shot(browser: Path, target: Path, to: str, profile: str | None, workdir: Path) -> int:
    if Image is None:
        print('缺少 Pillow，无法裁剪截图。请先安装：pip install Pillow')
        return 1

    # 临时静态服务：只用于截图，只监听本机
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(ROOT)
    )
    with socketserver.TCPServer(('127.0.0.1', 0), handler) as httpd:
        httpd.allow_reuse_address = True
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            query = {'to': to, '_': '1'}
            if profile:
                query['profile'] = profile
            url = (
                f'http://127.0.0.1:{port}/_qa/shot-standalone.html?'
                + urllib.parse.urlencode(query)
            )
            raw = workdir / 'shot.raw.png'
            args = [
                str(browser),
                '--headless=new',
                '--disable-gpu',
                '--no-first-run',
                '--no-default-browser-check',
                '--hide-scrollbars',
                f'--user-data-dir={workdir / "profile-shot"}',
                '--window-size=520,900',
                '--force-device-scale-factor=2',
                '--virtual-time-budget=9000',
                f'--screenshot={raw}',
                url,
            ]
            subprocess.run(args, capture_output=True, timeout=120)
        finally:
            httpd.shutdown()

    if not raw.exists():
        print('截图失败：浏览器没有输出文件。')
        return 1

    image = Image.open(raw).convert('RGB')
    scale = round(image.width / 520) or 1
    cropped = image.crop((0, 0, min(390 * scale, image.width), min(844 * scale, image.height)))
    target.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(target)
    print(f'已保存 {target}  {cropped.width}×{cropped.height}')
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description='单文件版校验与截图')
    parser.add_argument('--shot', help='把运行画面截图保存到该路径')
    parser.add_argument('--to', default='/home', help='截图对应的 hash 路由')
    parser.add_argument('--profile', default=None, help='预设画像：allergy / plain')
    args = parser.parse_args()

    if not STANDALONE.exists():
        print('还没有单文件版。请先运行：node tools/bundle-standalone.mjs')
        return 1
    if not HARNESS.exists():
        print(f'缺少截图台：{HARNESS}')
        return 1

    browser = find_browser()
    with tempfile.TemporaryDirectory(prefix='flc-standalone-') as tmp:
        workdir = Path(tmp)
        if args.shot:
            return take_shot(browser, Path(args.shot), args.to, args.profile, workdir)
        return run_checks(browser, workdir)


if __name__ == '__main__':
    raise SystemExit(main())
