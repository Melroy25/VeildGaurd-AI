# VeilGuard AI Desktop Sidebar Launcher (PowerShell)
Set-Location -Path $PSScriptRoot

$pythonExe = if (Test-Path ".\.venv\Scripts\python.exe") { ".\.venv\Scripts\python.exe" } else { "python" }
$pythonwExe = if (Test-Path ".\.venv\Scripts\pythonw.exe") { ".\.venv\Scripts\pythonw.exe" } else { $pythonExe }

# 1. Check if engine is running
$engineRunning = Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue
if (-not $engineRunning) {
    Write-Host "[1/2] Starting VeilGuard Local Engine in background..." -ForegroundColor Cyan
    Start-Process -FilePath $pythonExe -ArgumentList "-m veilguard_engine.server" -WindowStyle Minimized
    Start-Sleep -Seconds 2
} else {
    Write-Host "[1/2] VeilGuard Engine is already active on 127.0.0.1:8765." -ForegroundColor Green
}

# 2. Stop any previous sidebar instance so stale processes don't stack
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*desktop\sidebar_guard.py*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Milliseconds 300

# 3. Launch fresh Sidebar using pythonw.exe (GUI, no console window)
Write-Host "[2/2] Launching Ultra-Thin Sidebar..." -ForegroundColor Cyan
Start-Process -FilePath $pythonwExe -ArgumentList "desktop\sidebar_guard.py"
Write-Host "Success! VeilGuard Sidebar is active on your right screen edge." -ForegroundColor Green
