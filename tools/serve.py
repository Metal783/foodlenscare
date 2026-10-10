"""第三版兼容启动命令；统一进入本机/局域网家庭服务。"""
import socket
import sys

def local_ip():
    """查询当前局域网地址，不发送实际数据。"""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
        try:
            connection.connect(('8.8.8.8', 80))
            return connection.getsockname()[0]
        except OSError:
            return '127.0.0.1'

def main():
    # 原参数仅为兼容调用保留；第三版不再启动缺少家庭接口的旧静态服务。
    sys.argv = [item for item in sys.argv if item not in ('--mobile', '--no-qr')]
    from family_server import main as family_main
    family_main()
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
