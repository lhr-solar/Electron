@echo off
REM Known-good backend launcher (blocking). Used by ElectronBackendLog / boot script.
cd /d C:\Users\Parthiv\Electron-v2
set PYTHONUNBUFFERED=1
if not exist "D:\LHR Telemetry\logs" mkdir "D:\LHR Telemetry\logs" >nul 2>&1
.venv\Scripts\python.exe scripts\run_backend.py --host 0.0.0.0 --port 4000 >> "D:\LHR Telemetry\logs\backend.out" 2>&1
