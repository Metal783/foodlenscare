@echo off
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo 找不到已构建网页，请先运行 npm.cmd ci 和 npm.cmd run build。
  pause
  exit /b 1
)
echo 正在启动食护家 第五版 5.0.0 ...
call python -c "import sys; assert sys.version_info >= (3, 10)" >nul 2>&1
if not errorlevel 1 (
  call python -X utf8 tools\family_server.py --open
  if errorlevel 1 pause
  exit /b
)
call py -3 -c "import sys; assert sys.version_info >= (3, 10)" >nul 2>&1
if not errorlevel 1 (
  call py -3 -X utf8 tools\family_server.py --open
  if errorlevel 1 pause
  exit /b
)
echo 未找到 Python 3.10 或以上版本。请先安装Python，安装时勾选加入PATH，再重新打开。
pause
exit /b 1
