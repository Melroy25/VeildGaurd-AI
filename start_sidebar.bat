@echo off
title VeilGuard AI Desktop Sidebar
echo ========================================================
echo   VeilGuard AI Desktop Sidebar Companion
echo   Auto-activates on ChatGPT, Claude, Cursor, Gemini, etc.
echo ========================================================
echo.
cd /d "%~dp0"

if exist .venv\Scripts\python.exe (
    set PYTHON_EXE=.venv\Scripts\python.exe
) else (
    set PYTHON_EXE=python
)

if exist .venv\Scripts\pythonw.exe (
    set PYTHONW_EXE=.venv\Scripts\pythonw.exe
) else (
    set PYTHONW_EXE=%PYTHON_EXE%
)

:: 1. Check if engine is running on port 8765
netstat -ano | findstr 127.0.0.1:8765 >nul
if %ERRORLEVEL% NEQ 0 (
    echo [1/2] Starting VeilGuard Local Engine in background...
    start /min "VeilGuard Engine (Background)" "%PYTHON_EXE%" -m veilguard_engine.server
    timeout /t 2 /nobreak >nul
) else (
    echo [1/2] VeilGuard Engine is already active on 127.0.0.1:8765.
)

:: 2. Stop any existing sidebar instance to prevent ghost windows
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*desktop\sidebar_guard.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: 3. Launch fresh Ultra-Thin Sidebar
echo [2/2] Launching Ultra-Thin Sidebar...
start "" "%PYTHONW_EXE%" desktop\sidebar_guard.py

echo.
echo Success! VeilGuard is now active and docked to your right screen edge.
timeout /t 2 >nul
exit
