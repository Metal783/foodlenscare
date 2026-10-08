"""临时诊断：按真实顺序跑一遍，打印每一步的等级与已摄入量。"""
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, 'tools')
src = Path('tools/check-live-site.py').read_text(encoding='utf-8').split('def main()')[0]
ns = {}
exec(src, ns)
fetch = ns['fetch']

SEQUENCE = [
    ('首访', ''),
    ('画像设置', '#/onboarding'),
    ('红 花生', '?profile=allergy&reset=1#/result?case=peanut-cookie'),
    ('橙 糖', '?reset=1#/result?case=sugar-drink'),
    ('灰 糊', '?reset=1#/result?case=blurry-photo'),
    ('绿 奶', '?reset=1#/result?case=plain-milk'),
]

with tempfile.TemporaryDirectory() as tmp:
    pd = Path(tmp)
    for label, route in SEQUENCE:
        dom = fetch(route, pd, attempts=2, budget=25000)
        rendered = re.sub(r'<script[\s\S]*?</script>', ' ', dom)
        lvl = re.search(r'data-level="(\w+)"', rendered)
        head = re.search(r'class="risk-headline"[^>]*>(.*?)</h2>', rendered)
        intakes = re.findall(r'今天已经吃进 ([\d.]+) (\w+)', rendered)
        print(f'{label:8} level={(lvl.group(1) if lvl else "(无)"):8} '
              f'摄入={intakes if intakes else "无"}')
        if head:
            print(f'         结论={head.group(1)[:60]}')
