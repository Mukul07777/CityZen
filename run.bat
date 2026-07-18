@echo off
cd /d "%~dp0"
echo Starting CityZen dev server...
call npm run dev
pause
