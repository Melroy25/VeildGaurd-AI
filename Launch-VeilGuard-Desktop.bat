@echo off
title VeilGuard AI Desktop Launcher
echo ========================================================
echo   VeilGuard AI: Desktop Companion Launcher
echo   Context-Aware Privacy Firewall for AI Tools
echo ========================================================
echo.

cd /d "%~dp0"

if exist "release\VeilGuard-win64\VeilGuard.exe" (
    echo Launching compiled standalone executable...
    start "" "release\VeilGuard-win64\VeilGuard.exe"
    exit /b 0
)

if exist ".venv\Scripts\python.exe" (
    echo Launching via Python virtual environment...
    start "" ".venv\Scripts\pythonw.exe" desktop\app_main.py
    exit /b 0
)

echo [ERROR] Neither standalone executable nor .venv found.
echo Please run .\scripts\build-windows.ps1 first.
pause
