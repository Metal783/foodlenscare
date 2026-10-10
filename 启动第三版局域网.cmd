@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -X utf8 tools\family_server.py --host 0.0.0.0 --open
pause
