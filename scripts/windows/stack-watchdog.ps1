$ErrorActionPreference = "Continue"
$log = "D:\LHR Telemetry\logs\stack-watchdog.log"
function Log($m) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
  Add-Content -Path $log -Value $line
  Write-Host $line
}

New-Item -ItemType Directory -Force -Path "D:\LHR Telemetry\logs" | Out-Null

function Test-Url($url) {
  try {
    $null = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3
    return $true
  } catch { return $false }
}

function Ensure-Docker {
  if (Test-Path "\\.\pipe\dockerDesktopLinuxEngine") {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { return $true }
  }
  Log "docker engine down; starting"
  try { Start-Service com.docker.service -ErrorAction SilentlyContinue } catch {}
  if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) {
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  }
  for ($i = 0; $i -lt 36; $i++) {
    if (Test-Path "\\.\pipe\dockerDesktopLinuxEngine") {
      docker info 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { Log "docker ready"; return $true }
    }
    Start-Sleep 5
  }
  Log "docker failed to start"
  return $false
}

function Ensure-Compose {
  Set-Location "C:\Users\Parthiv\Electron-v2\grafana"
  docker compose up -d 2>&1 | Out-Null
}

function Ensure-Backend {
  if (Test-Url "http://127.0.0.1:4000/api/runtime-info") { return }
  Log "backend down; starting"
  $work = "C:\Users\Parthiv\Electron-v2"
  $py = "$work\.venv\Scripts\python.exe"
  $blog = "D:\LHR Telemetry\logs\backend.out"
  $cmd = "cmd.exe /c `"cd /d $work && set PYTHONUNBUFFERED=1 && set ELECTRON_MODE=server && `"$py`" scripts\run_backend.py --host 0.0.0.0 --port 4000 >> `"$blog`" 2>>&1`""
  $null = ([WMIClass]"Win32_Process").Create($cmd)
  Start-Sleep 10
}

Log "watchdog tick"
if (-not (Ensure-Docker)) { exit 1 }
Ensure-Compose
Start-Sleep 2
$gf = Test-Url "http://127.0.0.1:3000/"
$inf = Test-Url "http://127.0.0.1:8086/health"
Log ("grafana=" + $gf + " influx=" + $inf)
Ensure-Backend
$be = Test-Url "http://127.0.0.1:4000/api/runtime-info"
Log ("backend=" + $be)

# Ensure cloudflared running
$cfs = Get-Service Cloudflared -ErrorAction SilentlyContinue
if ($cfs -and $cfs.Status -ne "Running") {
  Log "restarting cloudflared"
  Start-Service Cloudflared
}
Log "watchdog done"
