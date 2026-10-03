param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Page = 'today',
  [string]$Mode = 'full',
  [int]$TimeoutSec = 30
)

$desktop = (Resolve-Path "$PSScriptRoot\..").Path
$electron = "$desktop\node_modules\electron\dist\electron.exe"
$profileDir = "$desktop\.test-profile"
$out = "$desktop\.$Name.png"

$env:HP_TEST_HASH = "page=$Page&mode=$Mode"
$env:HP_ALLOW_SECOND = '1'
$env:HP_TEST_OFFSCREEN = '1'
$env:HP_TEST_SHOT = $out

$p = Start-Process -FilePath $electron `
  -ArgumentList '.', "--user-data-dir=$profileDir" `
  -WorkingDirectory $desktop `
  -PassThru -WindowStyle Normal

$exited = $p.WaitForExit($TimeoutSec * 1000)
if (-not $exited) {
  & taskkill /PID $p.Id /T /F 2>&1 | Out-Null
  throw "test instance timed out after ${TimeoutSec}s"
}

Remove-Item Env:\HP_TEST_HASH
Remove-Item Env:\HP_ALLOW_SECOND
Remove-Item Env:\HP_TEST_OFFSCREEN
Remove-Item Env:\HP_TEST_SHOT

if (Test-Path $out) {
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile($out)
  "saved $out ($($img.Width)x$($img.Height))"
  $img.Dispose()
} else {
  throw "screenshot missing: $out"
}
