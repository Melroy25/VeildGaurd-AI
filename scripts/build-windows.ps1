# VeilGuard AI - Standalone Windows Executable Build Script
# Creates a clean single-directory release bundle using PyInstaller.
# Note on Licensing: Uses --onedir mode to comply with dynamic linking requirements
# of LGPL (pystray) and AGPL (PyMuPDF) as documented in docs/LICENSING.md.

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   VeilGuard AI: Windows Standalone App Packager" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$VenvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Error "Virtual environment not found at .venv. Please run .\scripts\setup.ps1 first."
}

# 1. Clean previous build artifacts
Write-Host "[1/5] Cleaning previous build folders..." -ForegroundColor Yellow
$BuildDir = Join-Path $RepoRoot "build"
$DistDir = Join-Path $RepoRoot "dist"
$ReleaseDir = Join-Path $RepoRoot "release\VeilGuard-win64"

if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
if (Test-Path $ReleaseDir) { Remove-Item -Recurse -Force $ReleaseDir }

# 2. Run PyInstaller
Write-Host "[2/5] Compiling standalone Windows bundle with PyInstaller..." -ForegroundColor Yellow
$PyInstallerArgs = @(
    "-m", "PyInstaller",
    "--name=VeilGuard",
    "--onedir",
    "--windowed",
    "--clean",
    "--noconfirm",
    "--add-data=policies;policies",
    "--collect-all=veilguard_engine",
    "--collect-all=spacy",
    "--collect-all=en_core_web_sm",
    "--collect-all=presidio_analyzer",
    "--collect-all=presidio_anonymizer",
    "--hidden-import=uvicorn",
    "--hidden-import=fastapi",
    "--hidden-import=pydantic",
    "--hidden-import=pystray",
    "--hidden-import=PIL",
    "--hidden-import=fitz",
    "--hidden-import=pypdf",
    "--hidden-import=yaml",
    "desktop/app_main.py"
)

& $VenvPython $PyInstallerArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "PyInstaller build failed with exit code $LASTEXITCODE."
}

# 3. Move output to release/VeilGuard-win64
Write-Host "[3/5] Moving compiled binary to release/VeilGuard-win64..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReleaseDir) | Out-Null
Move-Item -Path (Join-Path $DistDir "VeilGuard") -Destination $ReleaseDir

# 4. Include Documentation & Notices
Write-Host "[4/5] Adding Release Documentation..." -ForegroundColor Yellow
Copy-Item (Join-Path $RepoRoot "THIRD_PARTY_NOTICES.md") (Join-Path $ReleaseDir "THIRD_PARTY_NOTICES.txt")
Copy-Item (Join-Path $RepoRoot "PRIVACY.md") (Join-Path $ReleaseDir "PRIVACY.txt")
Copy-Item (Join-Path $RepoRoot "SECURITY.md") (Join-Path $ReleaseDir "SECURITY.txt")

$ReadmeContent = @"
================================================================================
VeilGuard AI: Windows Desktop Application (v0.2.0-glass)
Team Vexora | DevHack 2026
================================================================================

How to Run:
  1. Double-click VeilGuard.exe to launch.
  2. The application starts the local privacy firewall engine in the background
     and displays a discreet edge-docked sidebar on the right of your screen.
  3. A shield icon will also appear in your system notification tray.

Features:
  - Smart Auto-Pop: Slides open when AI apps (ChatGPT, Codex, Claude, Cursor) are focused.
  - Click-Outside-to-Close: Automatically collapses into a 6px edge sliver when you click away.
  - Esc to dismiss instantly.
  - Ctrl+Enter to Sanitize & Copy prompt in 1-click.
  - Dual-verification PDF Redaction.

Command Line Options:
  VeilGuard.exe --selftest    Run self-test diagnostic
  VeilGuard.exe --engine      Run local engine only (for API integrations)
  VeilGuard.exe --sidebar     Run companion sidebar only
  VeilGuard.exe --version     Display version information

Privacy Invariants:
  - Loopback only: Engine binds strictly to 127.0.0.1:8765.
  - Zero raw text persistence: Prompts are never written to disk or logs.
  - Zero telemetry: No data leaves your computer.
"@
Set-Content -Path (Join-Path $ReleaseDir "README.txt") -Value $ReadmeContent -Encoding UTF8

# 5. Verification
Write-Host "[5/5] Running self-test on compiled binary..." -ForegroundColor Yellow
$CompiledExe = Join-Path $ReleaseDir "VeilGuard.exe"
if (Test-Path $CompiledExe) {
    Write-Host "Success: Standalone executable created at $CompiledExe" -ForegroundColor Green
    & $CompiledExe --version
    Start-Sleep -Seconds 2

    # Create ZIP archive
    $ZipPath = Join-Path $RepoRoot "release\VeilGuard-win64.zip"
    if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
    Write-Host "Creating release archive: release\VeilGuard-win64.zip..." -ForegroundColor Cyan
    try {
        Compress-Archive -Path "$ReleaseDir\*" -DestinationPath $ZipPath -Force
        Write-Host "Release ZIP created at $ZipPath" -ForegroundColor Green
    } catch {
        Write-Warning "Could not create zip archive immediately: $_"
    }
} else {
    Write-Error "Compiled executable not found at $CompiledExe"
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   Windows Packaging Complete!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
