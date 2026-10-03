$ErrorActionPreference = 'Stop'
$desktop = (Resolve-Path "$PSScriptRoot\..").Path
$src = (Resolve-Path "$desktop\..\app\assets\images\icon.png").Path
$tmpDir = "$desktop\.icon-tmp"
$buildDir = "$desktop\build"
New-Item -ItemType Directory -Force -Path $tmpDir, $buildDir | Out-Null

Add-Type -AssemblyName System.Drawing

$sizes = 16, 24, 32, 48, 64, 128, 256
$pngPaths = @()

foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage([System.Drawing.Image]::FromFile($src), 0, 0, $size, $size)
  $g.Dispose()
  $p = "$tmpDir\icon-$size.png"
  $bmp.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $pngPaths += $p
}

# Combine into a multi-resolution .ico via png-to-ico.
$nodeScript = @"
const fs = require('fs');
const pngToIco = require('png-to-ico');
const paths = [$((($pngPaths | ForEach-Object { '"' + ($_ -replace '\\','/') + '"' }) -join ','))];
pngToIco(paths.map(p => fs.readFileSync(p)))
  .then(buf => fs.writeFileSync('$($buildDir -replace '\\','/')/icon.ico', buf))
  .then(() => console.log('icon.ico written'))
  .catch(err => { console.error(err); process.exit(1); });
"@

$nodeScript | Out-File -Encoding utf8 "$tmpDir\combine.js"
Push-Location $desktop
node "$tmpDir\combine.js"
Pop-Location

Remove-Item -Recurse -Force $tmpDir
Get-Item "$buildDir\icon.ico" | Select-Object FullName, Length
