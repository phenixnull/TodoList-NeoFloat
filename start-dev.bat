@echo off
setlocal

cd /d "%~dp0"

if not exist "package.json" (
  echo [ERROR] package.json not found in: %cd%
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  exit /b 1
)

echo Starting Neo Float Todo in dev mode...
call npm run dev

endlocal
