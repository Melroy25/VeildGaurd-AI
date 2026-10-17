# VeilGuard AI: Automated One-Command Setup Script for Windows (PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  VeilGuard AI: Automated One-Command Setup" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Verify Prerequisites
Write-Host "`n[1/6] Checking system prerequisites..." -ForegroundColor Yellow

$pythonCmd = $null
if (Get-Command "py" -ErrorAction SilentlyContinue) {
    $pythonCmd = "py -3"
} elseif (Get-Command "python" -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command "python3" -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
} else {
    Write-Error "Python 3.10+ is required but neither 'py', 'python', nor 'python3' was found in PATH."
    exit 1
}

$pyVer = Invoke-Expression "$pythonCmd -c `"import sys; print('.'.join(map(str, sys.version_info[:3])))`""
Write-Host "  Found Python: $pyVer ($pythonCmd)" -ForegroundColor Green

if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js (v18+) is required but 'node' was not found in PATH."
    exit 1
}
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Error "npm is required but 'npm' was not found in PATH."
    exit 1
}
$nodeVer = node -v
$npmVer = npm -v
Write-Host "  Found Node: $nodeVer, npm: $npmVer" -ForegroundColor Green

# 2. Virtual Environment Setup
Write-Host "`n[2/6] Configuring Python virtual environment..." -ForegroundColor Yellow
$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvDir = Join-Path $rootDir ".venv"
if (-not (Test-Path $venvDir)) {
    Write-Host "  Creating virtual environment at .venv..." -ForegroundColor Cyan
    Invoke-Expression "$pythonCmd -m venv `"$venvDir`""
} else {
    Write-Host "  Existing .venv detected." -ForegroundColor Cyan
}

$venvPython = Join-Path $venvDir "Scripts\python.exe"
$venvPip = Join-Path $venvDir "Scripts\pip.exe"
$venvPytest = Join-Path $venvDir "Scripts\pytest.exe"

# 3. Python Dependencies
Write-Host "`n[3/6] Installing Python engine dependencies..." -ForegroundColor Yellow
& $venvPython -m pip install --upgrade pip --quiet
$reqPath = Join-Path $rootDir "engine\requirements.txt"
$reqDevPath = Join-Path $rootDir "engine\requirements-dev.txt"
& $venvPip install -r $reqPath -r $reqDevPath --quiet

Write-Host "  Installing spaCy language model (en_core_web_sm)..." -ForegroundColor Cyan
& $venvPython -m spacy download en_core_web_sm --quiet

# 4. Node Dependencies
Write-Host "`n[4/6] Installing Node dependencies..." -ForegroundColor Yellow
Push-Location $rootDir
try {
    npm install --silent
} finally {
    Pop-Location
}

# 5. Extension Build
Write-Host "`n[5/6] Building Chrome extension..." -ForegroundColor Yellow
Push-Location $rootDir
try {
    npm run build
} finally {
    Pop-Location
}

# 6. Sanity Smoke Test
Write-Host "`n[6/6] Verifying engine installation with smoke test..." -ForegroundColor Yellow
$smokeTest = Join-Path $rootDir "tests\engine\test_smoke.py"
& $venvPytest -q $smokeTest

Write-Host "`n====================================================" -ForegroundColor Green
Write-Host "  VeilGuard AI setup completed successfully!         " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host "`nQuick Start Guide:"
Write-Host "  1. Start the local engine:"
Write-Host "     .\.venv\Scripts\python -m veilguard_engine.server" -ForegroundColor Cyan
Write-Host "  2. Start the mock AI chat testbed:"
Write-Host "     npm run mock-site" -ForegroundColor Cyan
Write-Host "  3. Load the unpacked extension in Google Chrome:"
Write-Host "     Navigate to chrome://extensions, enable 'Developer mode', and 'Load unpacked' from: extension\dist" -ForegroundColor Cyan
Write-Host "  4. Visit the mock site: http://127.0.0.1:4310" -ForegroundColor Cyan
Write-Host "====================================================`n"
