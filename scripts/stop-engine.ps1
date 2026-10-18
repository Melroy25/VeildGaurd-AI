# VeilGuard AI: Stop Engine Process on Windows

Write-Host "Looking for running VeilGuard engine processes..." -ForegroundColor Cyan

$stopped = $false

# 1. Check port 8765 listeners
try {
    $conns = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "Stopping process PID $($p.Id) ($($p.ProcessName))..." -ForegroundColor Yellow
            Stop-Process -Id $p.Id -Force
            $stopped = $true
        }
    }
} catch {
    # Ignore
}

# 2. Check for python/pythonw processes with veilguard_engine in commandline
try {
    $wmiProcs = Get-CimInstance Win32_Process -Filter "Name LIKE 'python%.exe'" | Where-Object {
        $_.CommandLine -match "veilguard_engine"
    }
    foreach ($proc in $wmiProcs) {
        Write-Host "Stopping VeilGuard process PID $($proc.ProcessId)..." -ForegroundColor Yellow
        Stop-Process -Id $proc.ProcessId -Force
        $stopped = $true
    }
} catch {
    # Ignore
}

if ($stopped) {
    Write-Host "VeilGuard Engine has been stopped." -ForegroundColor Green
} else {
    Write-Host "No running VeilGuard Engine was found on port 8765." -ForegroundColor Yellow
}
