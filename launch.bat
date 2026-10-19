@echo off
setlocal
title VeilGuard AI Launcher
cd /d "%~dp0"

echo ======================================================================
echo    VeilGuard AI: Privacy Firewall for AI Tools [v0.2.0-glass]
echo    Supporting: Codex, ChatGPT, Claude, Cursor, Copilot and Web AI
echo ======================================================================
echo.

:: 1. Detect Python virtual environment
set "PYTHON_EXE="
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

set "PYTHONW_EXE="
if exist "%~dp0.venv\Scripts\pythonw.exe" (
    set "PYTHONW_EXE=%~dp0.venv\Scripts\pythonw.exe"
) else (
    set "PYTHONW_EXE=%PYTHON_EXE%"
)

:: 2. Check and start local privacy engine at 127.0.0.1:8765 if not already running
netstat -ano | findstr "127.0.0.1:8765" >nul 2>&1
if errorlevel 1 (
    echo [1/3] Starting VeilGuard Local Privacy Engine at 127.0.0.1:8765...
    start /min "VeilGuard Engine" "%PYTHON_EXE%" -m veilguard_engine.server
    ping 127.0.0.1 -n 3 >nul
) else (
    echo [1/3] VeilGuard Engine is active on 127.0.0.1:8765.
)

:: 3. Stop any frozen or ghost sidebar instances
echo [2/3] Preparing fresh Desktop Sidebar Companion...
taskkill /F /IM VeilGuard.exe >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*desktop\sidebar_guard.py*' -or $_.CommandLine -like '*desktop\app_main.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
ping 127.0.0.1 -n 2 >nul

:: 4. Launch the desktop sidebar
echo [3/3] Launching VeilGuard Sidebar...
start "" "%PYTHONW_EXE%" "%~dp0desktop\sidebar_guard.py"

echo.
echo ======================================================================
echo  [OK] VeilGuard Sidebar is now LIVE and OPEN on your screen!
echo.
echo  HOW TO TEST WITH CODEX AND CHATGPT:
echo   1. CODEX APP:
echo      - Switch to Codex. VeilGuard detects it automatically.
echo      - Click 'Grab from Codex' in VeilGuard to inspect your prompt.
echo      - Click 'Send to App' to paste and submit the sanitized prompt!
echo.
echo   2. CHATGPT APP / BROWSER:
echo      - Switch to ChatGPT [app or web].
echo      - VeilGuard auto-pops open on the edge.
echo      - Click 'Pin' in the header to keep it pinned open while working.
echo      - Type or paste prompts to sanitize sensitive data in real-time.
echo ======================================================================
ping 127.0.0.1 -n 4 >nul
exit /b 0
