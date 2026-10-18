@echo off
title VeilGuard AI Engine (Local 127.0.0.1:8765)
echo ========================================================
echo   VeilGuard AI Engine - Local Privacy Firewall
echo   Listening on strictly http://127.0.0.1:8765
echo ========================================================
echo.
cd /d "%~dp0"

if exist .venv\Scripts\python.exe (
    set PYTHON_EXE=.venv\Scripts\python.exe
    echo Starting VeilGuard Engine via Python environment...
    "%PYTHON_EXE%" -m veilguard_engine.server
) else if exist release\VeilGuard-win64\VeilGuard.exe (
    echo Starting VeilGuard Engine via release executable...
    "release\VeilGuard-win64\VeilGuard.exe" --engine
) else (
    echo [ERROR] Neither .venv nor release\VeilGuard-win64\VeilGuard.exe found.
    pause
)
