@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo 找不到已构建的前端，请先运行 npm.cmd install 和 npm.cmd run build。
  pause
  exit /b 1
)
python -X utf8 tools\family_server.py --open
if errorlevel 1 pause
