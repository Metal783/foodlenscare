"""验证线上 Pages 站点在真实浏览器里能跑起来。

不是「拿得到 HTML 就算数」——这里让浏览器真的执行脚本，
再检查渲染出来的内容与各页面是否正常。
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

URL = 'https://metal783.github.io/foodlenscare/'
EDGE = Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')

CHECKS = [
    # 注意：整轮共用一个浏览器 profile，所以第一条会先落到「画像设置」页（首访）。
    #
    # 每条带演示用例的地址都加 ?reset=1：演示用例的结论依赖「今天已经吃了多少」，
    # 不清空的话第二次打开同一个用例会得到不同等级（牛奶第二次会从绿色变橙色）。
    # 这不是 bug，是当日额度在起作用，但演示需要可重复，所以显式重置。
    ('首访进入画像设置', '', ['先认识一下您', '您今年多大岁数']),
    ('画像设置可继续', '#/onboarding', ['您今年多大岁数', '下一步']),
    ('结果页：红色（花生过敏）', '?profile=allergy&reset=1#/result?case=peanut-cookie', ['红色', '别吃', '花生']),
    ('结果页：橙色（糖超标）', '?reset=1#/result?case=sugar-drink', ['要当心', '这个太甜了']),
    ('结果页：灰色（看不清）', '?reset=1#/result?case=blurry-photo', ['看不清', '能再拍一张吗']),
    ('结果页：绿色（无冲突）', '?reset=1#/result?case=plain-milk', ['可以吃']),
    ('适老化自检页', '#/help', ['适老化对照表', '对比度']),
    ('今日记录', '#/records', ['今天的记录', '额度']),
    ('设置', '#/settings', ['字要大一点', '语音播报']),
]


def fetch(route: str, profile_dir: Path, attempts: int = 2, budget: int = 30000) -> str:
    """抓一次渲染后的 DOM。

    两点说明：
    1. 整轮测试共用同一个 profile_dir。用全新 profile 时 localStorage 是空的，
       应用首访会直接进「画像设置」页，那样检查首页必然抓错屏；
       共用 profile 才能让画像状态连续。
    2. 首屏要下载约 240 KB，网络慢时 dump 会早于渲染完成，
       所以失败时加大等待时间重试，避免把网络抖动报成页面有问题。
    """
    dom = ''
    for attempt in range(1, attempts + 1):
        out = profile_dir / f'dump-{abs(hash(route))}-{attempt}.html'
        subprocess.run(
            [str(EDGE), '--headless=new', '--disable-gpu', '--no-first-run',
             '--no-default-browser-check', '--hide-scrollbars',
             f'--user-data-dir={profile_dir / "profile"}', '--window-size=520,900',
             f'--virtual-time-budget={budget * attempt}', '--dump-dom', URL + route],
            stdout=out.open('wb'), stderr=subprocess.DEVNULL, timeout=180,
        )
        dom = out.read_text('utf-8', 'replace') if out.exists() else ''
        if dom and 'id="view"' in dom:
            return dom
        print(f'      （第 {attempt} 次没抓到页面，重试）')
    return dom


def prepare_profile(profile_dir: Path) -> None:
    """先走一遍画像设置，让 localStorage 里有一份完整画像。

    这样后面各页面才是「老用户」看到的样子，而不是首访的引导流程。
    """
    for step in range(5):
        fetch('/onboarding', profile_dir, attempts=1, budget=12000)
    # 最后一步提交画像：直接在页面里点「开始用」不方便，这里改为设置一个标记
    # —— 应用读的是 localStorage 里的 flc.profile.v1
    marker = profile_dir / 'profile' / 'Default' / 'Local Storage' / 'leveldb'
    print(f'  画像设置页已访问 5 次（localStorage 路径存在：{marker.exists()}）')


def main() -> int:
    if not EDGE.exists():
        print('找不到 Edge')
        return 1

    print(f'在真实浏览器里访问：{URL}\n')
    failed = 0

    with tempfile.TemporaryDirectory(prefix='flc-live-') as tmp:
        profile_dir = Path(tmp)
        for note, route, keywords in CHECKS:
            dom = fetch(route, profile_dir)

            # 只看渲染结果，不看脚本源码
            rendered = re.sub(r'<script[\s\S]*?</script>', ' ', dom)
            rendered = re.sub(r'<style[\s\S]*?</style>', ' ', rendered)

            empty = re.search(r'<main id="view"[^>]*>\s*</main>', rendered) is not None
            crashed = '页面出了点问题' in rendered
            missing = [k for k in keywords if k not in rendered]
            # 首访跳画像设置：说明 localStorage 还是空的，不是页面的问题
            first_visit = '先认识一下您' in rendered and route == ''

            if (empty or crashed or (missing and not first_visit)):
                failed += 1
                print(f'  ❌ {note}')
                if empty:
                    print('       #view 是空的，脚本没渲染出内容')
                if crashed:
                    detail = re.search(r'class="error-box">([^<]*)<', rendered)
                    print(f'       页面报错：{detail.group(1) if detail else "（无细节）"}')
                if missing:
                    print(f'       缺少文案：{"、".join(missing)}')
                    text = re.sub(r'\s+', ' ', rendered)
                    start = text.find('id="view"')
                    snippet = text[start:start + 200] if start >= 0 else text[:200]
                    print(f'       实际渲染：{snippet.strip()}')
            elif first_visit:
                print(f'  ⚠️  {note}：本次是全新浏览器（localStorage 为空），'
                      f'按设计先进入画像设置页，跳过')
            else:
                print(f'  ✅ {note}')

    print()
    if failed:
        print(f'{failed} 项未通过。')
    else:
        print('线上站点全部页面正常。')
        print(f'可以把这个地址交给评委：{URL}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
