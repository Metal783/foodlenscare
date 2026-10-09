@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo 未找到 Python。请先安装 Python，再打开此文件。
  pause
  exit /b 1
)
echo 正在启动新版中文 OCR，浏览器将自动打开。
echo 使用期间请保持这个窗口开启。按 Ctrl+C 可停止服务。
python -X utf8 tools\serve.py --mobile --host 127.0.0.1 --no-qr --open
pause
