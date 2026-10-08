$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$wavPath = Join-Path $env:TEMP "habitpulse-stt-test.wav"

if (-not (Test-Path $wavPath)) {
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.SetOutputToWaveFile($wavPath)
    $synth.Speak("今天已经阅读二十分钟，帮我打卡")
    $synth.Dispose()
    Write-Host "Generated test WAV: $wavPath"
}

$audioBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($wavPath))
$payload = @{
    audio_base64 = $audioBase64
    audio_format = "wav"
    language     = $null
} | ConvertTo-Json -Compress

$response = Invoke-RestMethod -Uri "http://127.0.0.1:8100/transcribe" -Method Post -ContentType "application/json; charset=utf-8" -Body $payload -TimeoutSec 120
Write-Host "language: $($response.language)"
Write-Host "text: $($response.text)"
