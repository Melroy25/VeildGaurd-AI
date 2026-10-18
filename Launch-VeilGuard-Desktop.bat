@echo off
title VeilGuard AI Desktop Launcher
echo ========================================================
echo   VeilGuard AI: Desktop Sidebar Companion
echo   Context-Aware Privacy Firewall for AI Tools
echo ========================================================
echo.

cd /d "%~dp0"

echo [VeilGuard AI] Starting Desktop Sidebar Companion...

if exist "release\VeilGuard-win64\VeilGuard.exe" (
    start "" "release\VeilGuard-win64\VeilGuard.exe"
    echo [OK] Sidebar Companion is now active on the right edge of your screen!
    timeout /t 2 >nul
    exit /b 0
)

if exist ".venv\Scripts\python.exe" (
    start "" ".venv\Scripts\pythonw.exe" desktop\app_main.py
    echo [OK] Sidebar Companion launched via Python environment.
    echo Look at the right edge of your screen for the sidebar!
    timeout /t 2 >nul
    exit /b 0
)

echo [ERROR] Neither standalone executable nor .venv found.
echo Please run .\scripts\build-windows.ps1 first.
pause
