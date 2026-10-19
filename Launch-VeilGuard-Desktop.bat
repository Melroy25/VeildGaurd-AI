@echo off
setlocal enabledelayedexpansion
title VeilGuard AI Desktop Companion
cd /d "%~dp0"

echo ======================================================================
echo    VeilGuard AI: Desktop Companion Sidebar (v0.2.0-glass)
echo    Context-Aware Privacy Firewall for AI Tools
echo ======================================================================
echo.

if "%1"=="--restart" goto :kill_old
if "%1"=="/restart" goto :kill_old
if "%1"=="-r" goto :kill_old

:check_running
tasklist /FI "IMAGENAME eq VeilGuard.exe" 2>nul | find /I /N "VeilGuard.exe">nul
if "%ERRORLEVEL%"=="0" (
    echo [INFO] VeilGuard is already running in background!
    echo [INFO] Signaling existing sidebar to expand...
    if exist "release\VeilGuard-win64\VeilGuard.exe" (
        start "" "release\VeilGuard-win64\VeilGuard.exe"
    ) else if exist ".venv\Scripts\pythonw.exe" (
        start "" ".venv\Scripts\pythonw.exe" desktop\app_main.py
    )
    echo.
    echo ======================================================================
    echo  Look on the LEFT edge of your screen! The blue handle is active.
    echo  (Tip: Run 'Launch-VeilGuard-Desktop.bat --restart' to force reload)
    echo ======================================================================
    timeout /t 3 >nul
    exit /b 0
)

:launch_app
echo [VeilGuard AI] Starting Desktop Sidebar Companion...
if exist "release\VeilGuard-win64\VeilGuard.exe" (
    start "" "release\VeilGuard-win64\VeilGuard.exe"
    echo.
    echo ======================================================================
    echo  [OK] VeilGuard Sidebar is now OPEN on the LEFT edge of your screen!
    echo       - Click the blue shield handle to open/collapse anytime.
    echo       - Click 'Pin' to keep it open while using Codex.
    echo       - Click '📥 Grab from Codex' or type your prompt to sanitize.
    echo       - Click '🚀 Send to App' to safely submit sanitized prompt!
    echo ======================================================================
    timeout /t 4 >nul
    exit /b 0
)

if exist ".venv\Scripts\pythonw.exe" (
    start "" ".venv\Scripts\pythonw.exe" desktop\app_main.py
    echo.
    echo ======================================================================
    echo  [OK] VeilGuard Sidebar launched via Python environment.
    echo       Look on the LEFT edge of your screen for the sidebar!
    echo ======================================================================
    timeout /t 4 >nul
    exit /b 0
)

echo [ERROR] Neither standalone executable nor .venv found.
echo Please run .\scripts\build-windows.ps1 first.
pause
exit /b 1

:kill_old
echo [INFO] Stopping existing VeilGuard processes...
taskkill /F /IM VeilGuard.exe >nul 2>&1
timeout /t 1 >nul
goto :launch_app
