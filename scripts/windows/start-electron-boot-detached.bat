@echo off
REM Non-blocking launcher for scheduled tasks (schtasks /Run returns immediately).
start "" /MIN cmd /c "%~dp0start-electron-boot.bat"
