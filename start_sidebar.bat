@echo off
title VeilGuard AI Desktop Sidebar
echo ==============================================
echo   VeilGuard AI Desktop Sidebar Companion
echo   Auto-activates on ChatGPT, Claude, etc.
echo ==============================================
echo.

if exist .venv\Scripts\python.exe (
    set PYTHON_EXE=.venv\Scripts\python.exe
) else (
    set PYTHON_EXE=python
)

echo Starting VeilGuard Desktop Sidebar...
start "" "%PYTHON_EXE%" desktop\sidebar_guard.py
echo Sidebar is running in the background docked to the right screen edge.
exit
