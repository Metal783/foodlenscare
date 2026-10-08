"""验证 tools/module-check.mjs 的定向回归检查真的能抓到问题。

做法：把源码改动注入到真实文件里，跑一次检查，确认转红，再立刻还原。
每个场景都在 finally 里还原，文件不会停留在被改坏的状态。
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NODE = r'C:\Users\lenovo\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'

SCENARIOS = [
    {
        'name': 'confirm.js 不导入 fill',
        'file': 'src/pages/confirm.js',
        'old': "import { h, button, topbar, fill } from '../ui/dom.js';",
        'new': "import { h, button, topbar } from '../ui/dom.js';",
        'expect': 'fill',
    },
    {
        'name': 'pickPhoto 改回 focus + 定时器兜底',
        'file': 'src/core/flow.js',
        'old': "  return new Promise((resolve) => {\n    pendingResolve = resolve;\n    input.click();\n  });",
        'new': "  window.addEventListener('focus', () => setTimeout(() => settle(null), 1200), { once: true });\n"
               "  return new Promise((resolve) => {\n    pendingResolve = resolve;\n    input.click();\n  });",
        'expect': 'focus',
    },
    {
        'name': '语音条又用 display:flex 盖掉 hidden',
        'file': 'src/styles/app.css',
        'old': '.speaker-bar[hidden] { display: none; }',
        'new': '',
        'expect': 'speaker-bar',
    },
    {
        'name': '按下反馈又改回 transform 位移',
        'file': 'src/styles/app.css',
        'old': '.btn:active { filter: brightness(0.92); }',
        'new': '.btn:active { transform: translateY(1px); }',
        'expect': 'transform',
    },
]


def main() -> int:
    caught = 0

    # 先确认基线是绿的
    baseline = subprocess.run([NODE, 'tools/module-check.mjs'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if baseline.returncode != 0:
        print('基线就不干净，先修好再验证：')
        print(baseline.stdout[-800:])
        return 1
    print('基线：检查全绿。\n')

    for scenario in SCENARIOS:
        path = ROOT / scenario['file']
        original = path.read_text(encoding='utf-8')
        if scenario['old'] not in original:
            print(f'⚠️  {scenario["name"]}：找不到锚点，跳过')
            continue

        mutated = original.replace(scenario['old'], scenario['new'], 1)
        try:
            path.write_text(mutated, encoding='utf-8')
            result = subprocess.run(
                [NODE, 'tools/module-check.mjs'], cwd=ROOT,
                capture_output=True, text=True, encoding='utf-8', errors='replace',
            )
            output = result.stdout + result.stderr
            if result.returncode != 0 and scenario['expect'] in output:
                caught += 1
                line = next((l.strip() for l in output.splitlines() if l.strip().startswith('❌')), '')
                print(f'✅ {scenario["name"]} → 被抓到')
                print(f'     {line[:110]}')
            else:
                print(f'❌ {scenario["name"]} → 没被抓到（退出码 {result.returncode}）')
        finally:
            path.write_text(original, encoding='utf-8')

    # 还原后再跑一次，确认仓库回到干净状态
    after = subprocess.run([NODE, 'tools/module-check.mjs'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    restored = after.returncode == 0

    print()
    print(f'抓到的场景：{caught}/{len(SCENARIOS)}')
    print(f'源码已还原且检查重新变绿：{"是" if restored else "否 —— 请检查！"}')
    return 0 if caught == len(SCENARIOS) and restored else 1


if __name__ == '__main__':
    sys.exit(main())
