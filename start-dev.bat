@echo off
setlocal

cd /d "%~dp0"

if not exist "start-dev.ps1" (
  echo [ERROR] start-dev.ps1 not found in: %cd%
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%cd%\start-dev.ps1"

endlocal
