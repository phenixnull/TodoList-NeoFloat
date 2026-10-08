$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $dir ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Error "Virtualenv not found. Run setup first (uv venv + pip install)."
}
$listener = Get-NetTCPConnection -LocalPort 8100 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host "HabitPulse STT service already listening on port 8100 (pid=$($listener[0].OwningProcess)). Skip."
    exit 0
}
Write-Host "Starting HabitPulse STT service on http://127.0.0.1:8100 ..."
& $python -m uvicorn stt_service:app --host 127.0.0.1 --port 8100
