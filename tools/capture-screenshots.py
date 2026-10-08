#!/usr/bin/env python3
"""
批量截取作品运行截图（参赛材料「图像佐证材料」用）

做法：用无头 Edge 打开 _qa/shot.html（页面里嵌一个 390×844 的 iframe，
应用在 iframe 内按真实手机宽度排版），截完再把右侧多余的空白裁掉，
保证输出就是干净的 390×844 @2x 手机截图。

用法：
    python tools/capture-screenshots.py            # 截全部
    python tools/capture-screenshots.py 04 05      # 只截编号前缀匹配的

需要 Edge 或 Chrome。它是可选的辅助脚本，删掉不影响应用运行。
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'docs' / 'screenshots'
SERVE = 'http://127.0.0.1:5173'

# (输出文件名, iframe 内要打开的 hash 路由, 说明)
SHOTS: list[tuple[str, str, str]] = [
    ('01-onboarding-age', '/onboarding', '首次使用：逐屏单问题（第一屏）'),
    ('02-home', '/home', '首页：唯一的主动作是拍一张照片'),
    ('03-home-profile', '/home', '首页：一键切换演示画像（同一标签不同结论）'),
    ('04-result-orange', '/result?case=sugar-drink', '结果页：糖超标 → 橙色'),
    ('05-result-gray', '/result?case=blurry-photo', '结果页：看不清 → 灰色，要求补拍'),
    ('06-result-green', '/result?case=plain-milk', '结果页：无冲突 → 绿色'),
    ('07-result-red', '/result?case=peanut-cookie', '结果页：命中花生过敏原 → 红色（画像为花生+牛奶过敏）'),
    ('08-records', '/records', '今日记录与当日额度'),
    ('09-settings', '/settings', '设置：字号三档、语音播报、画像修改'),
    ('10-help', '/help', '适老化对照表与依据来源'),
]

# 需要预设画像的截图：文件名 → ?profile= 的取值
PROFILE_FOR: dict[str, str] = {
    '07-result-red': 'allergy',
}

BROWSER_CANDIDATES = [
    Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'),
    Path(r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'),
    Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
    Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'),
]


def find_browser() -> Path:
    for path in BROWSER_CANDIDATES:
        if path.exists():
            return path
    found = shutil.which('msedge') or shutil.which('chrome')
    if found:
        return Path(found)
    raise SystemExit('找不到 Edge 或 Chrome，无法截图。')


def capture(browser: Path, name: str, route: str, workdir: Path) -> Path:
    raw = workdir / f'{name}.raw.png'
    profile = workdir / f'profile-{name}'
    preset = PROFILE_FOR.get(name)
    profile_qs = f'&profile={preset}' if preset else ''
    url = f'{SERVE}/_qa/shot.html?to={route}{profile_qs}&_={int(time.time() * 1000)}'
    args = [
        str(browser),
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--force-device-scale-factor=2',
        '--window-size=520,900',
        '--virtual-time-budget=9000',
        f'--user-data-dir={profile}',
        f'--screenshot={raw}',
        url,
    ]
    subprocess.run(args, capture_output=True, timeout=120)
    if not raw.exists():
        raise SystemExit(f'{name}: 截图失败（浏览器没有输出文件）')

    # 裁掉右侧多余空白，只保留 iframe 那 390×844 的逻辑像素
    image = Image.open(raw).convert('RGB')
    scale = round(image.width / 520) or 1  # force-device-scale-factor 生效后的实际倍数
    crop_w = 390 * scale
    crop_h = 844 * scale
    cropped = image.crop((0, 0, min(crop_w, image.width), min(crop_h, image.height)))
    target = OUT_DIR / f'{name}.png'
    cropped.save(target)
    raw.unlink(missing_ok=True)
    print(f'  {name}.png  {cropped.width}×{cropped.height}  {target.stat().st_size // 1024} KB')
    return target


def main() -> int:
    filters = [a for a in sys.argv[1:] if not a.startswith('-')]
    browser = find_browser()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    try:
        import urllib.request

        urllib.request.urlopen(f'{SERVE}/index.html', timeout=4)
    except Exception:
        print(f'本地服务没起来。请先在另一个终端运行：python tools/serve.py')
        print(f'（需要能访问 {SERVE}/index.html）')
        return 1

    todo = [s for s in SHOTS if not filters or any(s[0].startswith(f) for f in filters)]
    print(f'用 {browser.name} 截取 {len(todo)} 张运行截图：')
    started = time.time()
    with tempfile.TemporaryDirectory(prefix='flc-shots-') as tmp:
        workdir = Path(tmp)
        for name, route, note in todo:
            try:
                capture(browser, name, route, workdir)
            except SystemExit as error:
                print(f'  {name} 失败：{error}')
                continue
    print(f'完成，用时 {time.time() - started:.1f} 秒。输出目录：{OUT_DIR}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
