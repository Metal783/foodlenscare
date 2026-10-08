"""临时诊断：线上绿色用例到底判成了什么，当日记录里有什么。"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, 'tools')
src = Path('tools/check-live-site.py').read_text(encoding='utf-8').split('def main()')[0]
ns = {}
exec(src, ns)

fetch = ns['fetch']
URL = ns['URL']

with tempfile.TemporaryDirectory() as tmp:
    pd = Path(tmp)

    # 先热一下（首访会进画像设置）
    fetch('', pd, attempts=1, budget=15000)

    for label, route in [
        ('橙 糖', '?reset=1#/result?case=sugar-drink'),
        ('灰 糊', '?reset=1#/result?case=blurry-photo'),
        ('绿 奶', '?reset=1#/result?case=plain-milk'),
    ]:
        dom = fetch(route, pd, attempts=2, budget=25000)
        rendered = re.sub(r'<script[\s\S]*?</script>', ' ', dom)
        lvl = re.search(r'data-level="(\w+)"', rendered)
        head = re.search(r'class="risk-headline"[^>]*>(.*?)</h2>', rendered)
        has_reset = 'reset=1' in dom
        print(f'\n{label}: level={lvl.group(1) if lvl else "(无)"}')
        print(f'    结论={head.group(1) if head else "(无)"}')
        # 看看额度条上显示的已摄入量
        for m in re.finditer(r'今天已经吃进 ([\d.]+) (\w+)，一天的建议上限是 (\d+)', rendered):
            print(f'    已摄入 {m.group(1)} {m.group(2)} / 上限 {m.group(3)}')
