@echo off
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo 找不到前端构建文件，请先运行 npm.cmd run build。
  pause
  exit /b 1
)
echo 仅启动局域网后端，不自动打开浏览器。手机测试时请保留此窗口，可最小化。
python -X utf8 tools\family_server.py --host 0.0.0.0
if errorlevel 1 pause
