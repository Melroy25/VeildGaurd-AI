@echo off
title VeilGuard AI - Stop Engine
cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\stop-engine.ps1"

timeout /t 2 >nul
