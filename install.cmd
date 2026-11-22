@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [AGY HUD] 未检测到 Node.js，请先安装 Node.js ^>= 22.5.0 ^(https://nodejs.org^)
  pause
  exit /b 1
)

node scripts\install.mjs %*
echo.
pause
