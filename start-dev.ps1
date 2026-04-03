$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageJson = Join-Path $projectDir 'package.json'
$projectPattern = [regex]::Escape($projectDir)
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$viteScript = Join-Path $projectDir 'node_modules\vite\bin\vite.js'
$electronExe = Join-Path $projectDir 'node_modules\electron\dist\electron.exe'

function Get-ProcessByIdSafe {
  param(
    [int]$ProcessId
  )

  Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Get-RendererListener {
  $listeners = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $process = Get-ProcessByIdSafe -ProcessId $listener.OwningProcess
    if ($process -and $process.Name -match '^node(\.exe)?$' -and $process.CommandLine -match $projectPattern -and $process.CommandLine -match 'vite') {
      return $listener
    }
  }

  return $null
}

function Get-ForeignListener {
  $listeners = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $process = Get-ProcessByIdSafe -ProcessId $listener.OwningProcess
    if (-not $process) {
      continue
    }
    if ($process.Name -match '^node(\.exe)?$' -and $process.CommandLine -match $projectPattern -and $process.CommandLine -match 'vite') {
      continue
    }
    return $process
  }

  return $null
}

function Get-ElectronProcess {
  @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^electron(\.exe)?$' -and $_.CommandLine -match $projectPattern -and $_.CommandLine -notmatch '--type='
  }) | Select-Object -First 1
}

function Wait-Until {
  param(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Condition) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }

  return $false
}

if (-not (Test-Path $packageJson)) {
  throw "package.json not found in: $projectDir"
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is not available in PATH.'
}

$nodeExe = $nodeCommand.Source
if (-not $nodeExe) {
  throw 'node is not available in PATH.'
}

if (-not (Test-Path $viteScript)) {
  throw "Vite entry script not found: $viteScript"
}

if (-not (Test-Path $electronExe)) {
  throw "Electron executable not found: $electronExe"
}

$foreignListener = Get-ForeignListener
if ($foreignListener) {
  throw "Port 5173 is already in use by another process: $($foreignListener.Name) (PID $($foreignListener.ProcessId))"
}

$rendererListener = Get-RendererListener
if (-not $rendererListener) {
  Start-Process -FilePath $nodeExe -ArgumentList @($viteScript, '--port', '5173', '--strictPort') -WorkingDirectory $projectDir -WindowStyle Hidden | Out-Null
  $rendererReady = Wait-Until -TimeoutSeconds 30 -Condition { $null -ne (Get-RendererListener) }
  if (-not $rendererReady) {
    throw 'Timed out waiting for the Vite dev server on port 5173.'
  }
}

$electronProcess = Get-ElectronProcess
if (-not $electronProcess) {
  $previousDevServerUrl = $env:VITE_DEV_SERVER_URL
  $env:VITE_DEV_SERVER_URL = 'http://localhost:5173'
  try {
    Start-Process -FilePath $electronExe -ArgumentList @($projectDir) -WorkingDirectory $projectDir | Out-Null
  } finally {
    if ($null -eq $previousDevServerUrl) {
      Remove-Item Env:\VITE_DEV_SERVER_URL -ErrorAction SilentlyContinue
    } else {
      $env:VITE_DEV_SERVER_URL = $previousDevServerUrl
    }
  }
  $electronReady = Wait-Until -TimeoutSeconds 15 -Condition { $null -ne (Get-ElectronProcess) }
  if (-not $electronReady) {
    throw 'Timed out waiting for the Electron app to start.'
  }
}
