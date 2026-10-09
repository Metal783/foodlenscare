#!/usr/bin/env python3
"""
食护家 FoodLensCare · 本地静态服务

为什么需要它：作品定位是「扫码即可运行的 H5」，必须能用手机浏览器直接打开。
直接双击 index.html 会踩到两个坑：
  1. ES Module 在 file:// 下被 CORS 策略拦住，页面白屏；
  2. Service Worker 在 file:// 下无法注册，离线演示失效。

用法：
    python tools/serve.py                 # 默认 0.0.0.0:5173
    python tools/serve.py --port 8080
    python tools/serve.py --no-qr         # 不打印二维码

手机访问：确保手机与电脑在同一个 Wi-Fi，扫描终端里的二维码即可。
"""

from __future__ import annotations

import argparse
import http.server
import socket
import socketserver
import sys
import webbrowser
from urllib.parse import unquote, urlsplit
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Python 的默认 MIME 表认识 .js，但部分系统环境会把 .mjs/.webmanifest 认错，
# 而 ES Module 的 MIME 类型一旦不对，浏览器会直接拒绝执行。
EXTRA_TYPES = {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    """静态文件处理：无缓存（方便改完立刻看到效果）+ 正确 MIME + 安静日志。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def guess_type(self, path):
        suffix = Path(str(path)).suffix.lower()
        if suffix in EXTRA_TYPES:
            return EXTRA_TYPES[suffix]
        return super().guess_type(path)

    def end_headers(self):
        # 开发阶段禁用缓存，避免改了代码却看到旧页面
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        # Service Worker 需要独立作用域，这里显式声明允许
        self.send_header('Service-Worker-Allowed', '/')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 只打印出错与 404，正常请求不刷屏
        status = str(args[1]) if len(args) > 1 else ''
        if status.startswith(('4', '5')):
            sys.stderr.write(f'  [404] {args[0]}\n')
        return


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class MobileHandler(Handler):
    """手机试用仅公开运行页面与固定 OCR 资源，不公开项目目录。"""
    ALLOWED = {
        '/', '/index.html', '/sw.js',
    }
    ALLOWED.update('/assets/paddle/' + str(p.relative_to(ROOT / 'assets' / 'paddle')).replace('\\', '/')
                   for p in (ROOT / 'assets' / 'paddle').rglob('*') if p.is_file())

    def __init__(self, *args, **kwargs):
        http.server.SimpleHTTPRequestHandler.__init__(self, *args, directory=str(ROOT / 'docs'), **kwargs)

    def send_head(self):
        requested = unquote(urlsplit(self.path).path)
        if requested not in self.ALLOWED:
            self.send_error(404, 'Not found')
            return None
        return super().send_head()


def local_ip() -> str:
    """取本机在局域网中的地址（不会真的发包）。"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(('8.8.8.8', 80))
        return sock.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        sock.close()


def print_qr(url: str) -> None:
    """终端二维码：手机扫一下就能打开，省去手动输 IP。"""
    try:
        import qrcode  # type: ignore
    except ImportError:
        print('（未安装 qrcode 库，跳过二维码。想看到二维码可执行：pip install qrcode）')
        return

    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    qr.make()
    qr.print_ascii(invert=True)


def main() -> int:
    parser = argparse.ArgumentParser(description='食护家 FoodLensCare 本地静态服务')
    parser.add_argument('--port', type=int, default=5173, help='监听端口，默认 5173')
    parser.add_argument('--host', default='0.0.0.0', help='监听地址，默认 0.0.0.0（局域网可访问）')
    parser.add_argument('--no-qr', action='store_true', help='不打印二维码')
    parser.add_argument('--mobile', action='store_true', help='手机试用：仅提供 docs 运行页面与 OCR 资源，不公开项目目录')
    parser.add_argument('--open', action='store_true', help='启动后自动在浏览器打开本机页面')
    args = parser.parse_args()

    ip = local_ip()
    lan_url = f'http://{ip}:{args.port}/'
    local_url = f'http://127.0.0.1:{args.port}/'

    # 端口被占用时自动往后找一个可用端口，避免启动失败
    port = args.port
    for _ in range(20):
        try:
            httpd = Server((args.host, port), MobileHandler if args.mobile else Handler)
            break
        except OSError:
            port += 1
    else:
        print('端口都被占用了，请用 --port 指定一个空闲端口。', file=sys.stderr)
        return 1

    if port != args.port:
        lan_url = f'http://{ip}:{port}/'
        local_url = f'http://127.0.0.1:{port}/'
        print(f'端口 {args.port} 已被占用，改用 {port}。')

    print()
    print('  食护家 FoodLensCare · 食品标签解读 H5')
    print('  ' + '─' * 46)
    print(f'  本机打开：  {local_url}')
    if args.host not in ('127.0.0.1', 'localhost', '::1'):
        print(f'  手机打开：  {lan_url}   ← 手机需与电脑同一 Wi-Fi')
    print('  ' + '─' * 46)
    print('  提示：手机浏览器「添加到主屏幕」后可全屏运行，更像一个 App。')
    if args.mobile:
        print('  手机试用模式：仅提供运行页面与 OCR 资源。')
    print('  按 Ctrl+C 停止服务。')
    print()

    if not args.no_qr and args.host not in ('127.0.0.1', 'localhost', '::1'):
        print_qr(lan_url)
        print()

    if args.open:
        webbrowser.open(local_url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止服务。')
    finally:
        httpd.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
