# VeilGuard AI: Auto-Start Registration for Windows
# Registers the engine to start automatically on Windows login using pythonw.exe (0 terminal windows)

$ErrorActionPreference = "Stop"

$workspaceRoot = (Resolve-Path "$PSScriptRoot\..").Path
$pythonw = Join-Path $workspaceRoot ".venv\Scripts\pythonw.exe"

if (-not (Test-Path $pythonw)) {
    Write-Error "Could not find pythonw.exe in $workspaceRoot\.venv\Scripts"
    exit 1
}

$WshShell = New-Object -ComObject WScript.Shell
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "VeilGuard-Engine.lnk"

Write-Host "Registering VeilGuard Engine to Windows Startup..." -ForegroundColor Cyan
Write-Host "  Shortcut: $shortcutPath"
Write-Host "  Target:   $pythonw -m veilguard_engine.server"

$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $pythonw
$shortcut.Arguments = "-m veilguard_engine.server"
$shortcut.WorkingDirectory = $workspaceRoot
$shortcut.Description = "VeilGuard AI Local Privacy Firewall Engine"
$shortcut.Save()

Write-Host "`nSUCCESS: VeilGuard AI is registered to start automatically on login!" -ForegroundColor Green
Write-Host "The engine will run silently in the background with zero terminal windows.`n"

# Check if currently running, if not, start it now
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "Engine is already running on http://127.0.0.1:8765 (version: $($res.version))." -ForegroundColor Green
} catch {
    Write-Host "Starting engine now in background..." -ForegroundColor Yellow
    Start-Process -FilePath $pythonw -ArgumentList "-m veilguard_engine.server" -WorkingDirectory $workspaceRoot
    Start-Sleep -Seconds 2
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 3 -ErrorAction Stop
        Write-Host "Engine is now ONLINE on http://127.0.0.1:8765!" -ForegroundColor Green
    } catch {
        Write-Host "Engine started in background. It will be available momentarily." -ForegroundColor Cyan
    }
}
