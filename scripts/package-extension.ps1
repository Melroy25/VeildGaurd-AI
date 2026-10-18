<#
.SYNOPSIS
Packages the built VeilGuard extension into a clean release zip.
#>

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "=== VeilGuard AI: Extension Packaging Pipeline ===" -ForegroundColor Cyan

# 1. Build Extension
Write-Host "Building extension dist..." -ForegroundColor Yellow
npm run build

# 2. Prepare Release Directory
$ReleaseDir = Join-Path $RootDir "release"
if (!(Test-Path $ReleaseDir)) {
    New-Item -ItemType Directory -Path $ReleaseDir | Out-Null
}

$DistDir = Join-Path $RootDir "extension\dist"
$ManifestJson = Get-Content (Join-Path $DistDir "manifest.json") -Raw | ConvertFrom-Json
$Version = $ManifestJson.version
$ZipName = "veilguard-extension-$Version.zip"
$ZipPath = Join-Path $ReleaseDir $ZipName

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

# 3. Create INSTALL.txt inside dist
$InstallTxtPath = Join-Path $DistDir "INSTALL.txt"
@"
VeilGuard AI: Browser Extension Installation Instructions
Version: $Version

HOW TO INSTALL IN CHROMIUM BROWSERS (Brave, Chrome, Edge, Opera):
1. Open your browser and navigate to:
   - Brave: brave://extensions
   - Chrome: chrome://extensions
   - Edge:   edge://extensions
2. Enable "Developer mode" toggle (usually in the top-right corner).
3. Extract this zip file into a permanent folder on your computer.
4. Click "Load unpacked" button.
5. Select the extracted folder containing manifest.json.
6. The VeilGuard AI shield icon will appear in your extensions toolbar.

CONNECTING TO THE LOCAL ENGINE:
1. Ensure the VeilGuard Python engine is running on your machine:
   On Windows: double-click start_engine.bat
   Or run: python -m veilguard_engine.server
2. Open the extension popup or options dashboard to confirm:
   Status: Connected (🟢 GUARD ON)
"@ | Set-Content -Path $InstallTxtPath -Encoding UTF8

# 4. Create Archive
Write-Host "Creating archive: $ZipPath" -ForegroundColor Yellow
Compress-Archive -Path "$DistDir\*" -DestinationPath $ZipPath -Force

# Clean up temporary INSTALL.txt from dist
Remove-Item $InstallTxtPath -Force

# 5. Verify Package Hygiene
Write-Host "`nAuditing packaged release archive contents..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
$entries = $zip.Entries | Select-Object -ExpandProperty FullName

$forbidden = @(".env", "token", "cookie", ".map")
$violations = @()

foreach ($entry in $entries) {
    Write-Host "  - $entry"
    foreach ($bad in $forbidden) {
        if ($entry.ToLower().Contains($bad)) {
            $violations += "$entry contains forbidden string '$bad'"
        }
    }
}
$zip.Dispose()

if ($violations.Count -gt 0) {
    Write-Host "FAILED: Package hygiene check failed!" -ForegroundColor Red
    $violations | ForEach-Object { Write-Host "  Error: $_" -ForegroundColor Red }
    exit 1
}

$sizeKb = [math]::Round((Get-Item $ZipPath).Length / 1KB, 1)
Write-Host "`nSUCCESS: Package created cleanly!" -ForegroundColor Green
Write-Host "Archive: $ZipPath ($sizeKb KB)" -ForegroundColor Green
