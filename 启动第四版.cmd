@echo off
chcp 65001 >nul
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo 找不到已构建的前端，请先运行 npm.cmd install 和 npm.cmd run build。
  pause
  exit /b 1
)
python -X utf8 tools\family_server.py --open
if errorlevel 1 pause
