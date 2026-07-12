@echo off
REM Boot: ensure Docker (Influx/Grafana), then run backend (blocking so the task stays alive).
setlocal EnableExtensions
cd /d "%~dp0.."

set "LOGDIR=D:\LHR Telemetry\logs"
if not exist "%LOGDIR%" set "LOGDIR=%CD%\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1
set "LOG=%LOGDIR%\electron-boot.log"

echo ===== %DATE% %TIME% boot =====>> "%LOG%"

set "DOCKER=docker"
where docker >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
)

"%DOCKER%" info >nul 2>&1
if errorlevel 1 (
  echo Docker engine not ready; starting service + Desktop...>> "%LOG%"
  sc start com.docker.service >> "%LOG%" 2>&1
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  )
  for /L %%i in (1,1,36) do (
    "%DOCKER%" info >nul 2>&1 && goto :docker_ok
    ping -n 6 127.0.0.1 >nul
  )
  echo Docker engine still unavailable after wait.>> "%LOG%"
)
:docker_ok

pushd "%CD%\grafana"
"%DOCKER%" compose up -d >> "%LOG%" 2>&1
popd

for /L %%i in (1,1,30) do (
  curl -s -o NUL http://127.0.0.1:8086/ping && goto :influx_ok
  ping -n 3 127.0.0.1 >nul
)
echo Influx not ready; backend will retry.>> "%LOG%"
:influx_ok

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000" ^| findstr LISTENING') do (
  echo Killing existing :4000 PID %%p>> "%LOG%"
  taskkill /F /PID %%p >nul 2>&1
)

echo Starting backend (blocking)...>> "%LOG%"
set PYTHONUNBUFFERED=1
set "PYTHON=%CD%\.venv\Scripts\python.exe"
if not exist "%PYTHON%" set "PYTHON=python"
"%PYTHON%" "%CD%\scripts\run_backend.py" --host 0.0.0.0 --port 4000 >> "%LOGDIR%\backend.out" 2>&1
