"""交互回归：验证「点了按钮没反应」这类问题不会复现。

覆盖三件事：
  1. 关键按钮的点击是否真的触发了页面跳转；
  2. pickPhoto 不会在用户还没选完照片时就被超时逻辑提前判成「取消」；
  3. 选完照片后能正常进入确认页。

用法：python tools/check-interaction.py
不需要手动开服务——脚本自己起一个只监听本机的静态服务。

实现说明：用无头浏览器 + CDP 的方式太重，这里改为在页面里注入一段测试脚本，
用真实的 DOM 事件（click / change）驱动，再把结果写进 <div id="probe"> 供 dump-dom 读取。
"""

from __future__ import annotations

import functools
import os
import http.server
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / '_qa' / 'interaction-test.html'
PROBE = ROOT / 'docs' / 'screenshots'

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
    raise SystemExit('找不到 Edge 或 Chrome。')


def run_harness(browser: Path, url: str, workdir: Path) -> tuple[str, str]:
    """返回 (DOM, 浏览器 stderr)。stderr 里能看到 404 之类的加载失败线索。"""
    out = workdir / 'result.out'
    err = workdir / 'result.err'
    args = [
        str(browser),
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        # 显式标记自动化环境。
        '--enable-automation',
        f'--user-data-dir={workdir / "profile"}',
        '--window-size=520,900',
        '--virtual-time-budget=90000',
        '--dump-dom',
        url,
    ]
    subprocess.run(args, stdout=out.open('wb'), stderr=err.open('wb'), timeout=240)
    dom = out.read_text(encoding='utf-8', errors='replace') if out.exists() else ''
    stderr = err.read_text(encoding='utf-8', errors='replace') if err.exists() else ''
    return dom, stderr


def main() -> int:
    if not HARNESS.exists():
        print(f'缺少测试台：{HARNESS}')
        return 1

    # 第三版照片持久化用 IndexedDB，虚拟时钟不能可靠等待磁盘事务。
    # 优先使用已有 Playwright 的真实时钟，不增加应用运行依赖。
    playwright_path = Path(os.environ.get('FLC_PLAYWRIGHT_PATH', str(Path.home() / '.cache' / 'codex-runtimes' / 'codex-primary-runtime' / 'dependencies' / 'node' / 'node_modules' / 'playwright')))
    if '--verify-guards' not in sys.argv and playwright_path.exists() and shutil.which('node'):
        environment = {**os.environ, 'FLC_PLAYWRIGHT_PATH': str(playwright_path)}
        return subprocess.run(['node', str(ROOT / 'tools' / 'check-interaction-browser.cjs')], env=environment).returncode

    browser = find_browser()
    report = ''

    # 回归验证：确认这套测试真的能抓到那两个曾经的问题。
    # 不这样做的话，「测试通过」可能只是因为测试写得太松。
    if '--verify-guards' in sys.argv:
        return verify_guards(browser)

    # 必须用 ThreadingTCPServer：浏览器会并发拉取 ES Module，单线程 server
    # 一旦某个连接挂起（keep-alive 等），后续模块全部排队等不到，表现为
    # 页面加载到一半、probe 一直 pending。
    _QuietHandler.daemon_threads = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', 0), _QuietHandler) as httpd:
        port = httpd.server_address[1]
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        try:
            url = f'http://127.0.0.1:{port}/_qa/interaction-test.html'
            print('交互回归测试：\n')
            with tempfile.TemporaryDirectory(prefix='flc-interaction-') as tmp:
                dom, stderr_text = run_harness(browser, url, Path(tmp))
        finally:
            httpd.shutdown()

    # 用贪婪匹配取最后一个 </pre>：测试脚本自身源码里也含 "</pre>" 字面量，
    # 非贪婪匹配会截在脚本里，拿到的就不是真正的测试结果。
    match = re.search(r'<pre id="probe">([\s\S]*)</pre>', dom)
    if not match:
        print('没拿到测试结果，说明测试台本身没跑起来。')
        print('（DOM 长度 %d）' % len(dom))
        return 1

    report = match.group(1)
    # 结果里以「小计」结尾的那一段才是真正的报告；
    # 前面可能混进 HTML 头部（注释、样式等），这里只保留最后一段报告。
    idx = report.rfind('小计：')
    if idx < 0:
        print('测试结果里没有「小计」，说明脚本没跑完（可能是页面里的 JS 报错了）。')
        print(report[-600:])
        return 1

    before = report[:idx]
    starts = [before.find(tag) for tag in ('PASS  ', 'FAIL  ')]
    start = min([s for s in starts if s >= 0], default=0)
    report = (before[start:] + report[idx:]).strip()
    print(report)

    failed = len(re.findall(r'^FAIL', report, re.MULTILINE))
    if failed:
        print(f'\n{failed} 项未通过。')
        return 1
    if '失败 0' not in report:
        print('\n测试没有跑完。')
        return 1
    print('\n全部通过。')
    return 0


class _BaseHandler(http.server.SimpleHTTPRequestHandler):
    """带正确 MIME 映射的静态处理器。

    必须显式指定：Python 在 Windows 上会把 .js 认成 application/javascript，
    而浏览器对模块脚本只接受 text/javascript，MIME 不符会直接拒绝执行
    （而且表现为「页面什么都不做」，非常难查）。tools/serve.py 有同样的映射。
    """

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.webmanifest': 'application/manifest+json; charset=utf-8',
        '.svg': 'image/svg+xml',
    }

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def log_message(self, fmt, *args):
        status = str(args[1]) if len(args) > 1 else ''
        sys.stderr.write(f'  [HTTP {status}] {args[0]}\n')


class _QuietHandler(_BaseHandler):
    """服务仓库根目录"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)


def _make_handler(directory: Path):
    """生成一个只服务指定目录的静默静态处理器"""

    class _Handler(_BaseHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(directory), **kwargs)

    return _Handler


def _unused_old_make_handler():
    """（历史实现，保留位置以免混淆）"""
    raise NotImplementedError


if __name__ == '__main__':
    raise SystemExit(main())



