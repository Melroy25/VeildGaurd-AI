@echo off
title VeilGuard AI - Enable Windows Auto-Start
cd /d "%~dp0"

echo [VeilGuard AI] Registering engine to auto-start when Windows boots...
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\enable-autostart.ps1"

echo.
pause
