@echo off
title Launch VeilGuard AI Full Stack
echo ========================================================
echo   Launching VeilGuard AI Full Stack (Demo Ready)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Starting Local Python Engine (127.0.0.1:8765)...
start "VeilGuard Engine" .venv\Scripts\python.exe -m veilguard_engine.server

echo [2/3] Starting Mock AI Chat Site (127.0.0.1:4310)...
start "Mock AI Site" npm.cmd run mock-site

echo [3/3] Starting Desktop Sidebar Companion...
start "VeilGuard Sidebar" .venv\Scripts\python.exe desktop\sidebar_guard.py

echo.
echo All services launched in separate windows!
echo.
echo Opening Mock AI Site in your default browser...
start http://127.0.0.1:4310
echo.
echo If you haven't loaded the Chrome Extension yet:
echo   1. Open chrome://extensions in Chrome
echo   2. Enable "Developer mode" (top right)
echo   3. Click "Load unpacked" and select:
echo      %~dp0extension\dist
echo.
pause
