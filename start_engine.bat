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
) else (
    set PYTHON_EXE=python
)

:: Check if already running
netstat -ano | findstr 127.0.0.1:8765 >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] VeilGuard Engine is ALREADY RUNNING on 127.0.0.1:8765.
    echo Status: ONLINE
    echo You can close this window anytime.
    pause
    exit
)

echo Starting VeilGuard Engine on http://127.0.0.1:8765...
"%PYTHON_EXE%" -m veilguard_engine.server
