# VeilGuard AI: Auto-Start Unregistration for Windows

$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "VeilGuard-Engine.lnk"

if (Test-Path $shortcutPath) {
    Remove-Item -Path $shortcutPath -Force
    Write-Host "Removed VeilGuard shortcut from Windows Startup: $shortcutPath" -ForegroundColor Green
} else {
    Write-Host "VeilGuard was not found in Windows Startup folder." -ForegroundColor Yellow
}
