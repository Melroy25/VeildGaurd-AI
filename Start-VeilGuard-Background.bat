@echo off
title VeilGuard AI - Background Launcher
cd /d "%~dp0"

echo [VeilGuard AI] Starting local engine in silent background mode...
start "" ".\.venv\Scripts\pythonw.exe" -m veilguard_engine.server

ping -n 3 127.0.0.1 >nul
curl.exe -s http://127.0.0.1:8765/health
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] VeilGuard Privacy Engine is ONLINE at http://127.0.0.1:8765
    echo The engine is running silently in the background!
) else (
    echo.
    echo [INFO] Engine launched in background.
)
