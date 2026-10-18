# VeilGuard AI Desktop Sidebar Launcher (PowerShell)
$pythonExe = if (Test-Path ".\.venv\Scripts\python.exe") { ".\.venv\Scripts\python.exe" } else { "python" }
Write-Host "Launching VeilGuard Desktop Sidebar..." -ForegroundColor Cyan
Start-Process $pythonExe -ArgumentList "desktop\sidebar_guard.py"
Write-Host "Sidebar active and docked to right screen edge." -ForegroundColor Green
