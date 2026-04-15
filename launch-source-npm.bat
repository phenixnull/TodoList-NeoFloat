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

call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo [ERROR] npm run dev exited with code %EXIT_CODE%.
)

endlocal & exit /b %EXIT_CODE%
