# Test Voice Alert System
# Run this script to test all voice alerts

Write-Host "Testing Claude Code Voice Alert System" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get available voices
Write-Host "Available Voices:" -ForegroundColor Yellow
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.GetInstalledVoices() | ForEach-Object {
    Write-Host "  - $($_.VoiceInfo.Name)" -ForegroundColor Green
}
Write-Host ""

# Test main voice alert script
Write-Host "Testing voice-alert.ps1..." -ForegroundColor Yellow
$scriptPath = Join-Path $PSScriptRoot "voice-alert.ps1"

Write-Host "  1. Testing default message..."
& $scriptPath -Message "This is a test" -CooldownSeconds 0
Start-Sleep -Seconds 2

Write-Host "  2. Testing fast speech (Rate 2)..."
& $scriptPath -Message "Permission needed" -Rate 2 -Volume 100 -CooldownSeconds 0
Start-Sleep -Seconds 2

Write-Host "  3. Testing normal speech (Rate 1)..."
& $scriptPath -Message "Task complete" -Rate 1 -Volume 90 -CooldownSeconds 0
Start-Sleep -Seconds 2

Write-Host "  4. Testing agent finished message..."
& $scriptPath -Message "Agent finished" -Rate 1 -Volume 90 -CooldownSeconds 0
Start-Sleep -Seconds 2

# Test hook scripts
Write-Host ""
Write-Host "Testing hook scripts..." -ForegroundColor Yellow

Write-Host "  1. Testing hook-permission.ps1..."
& (Join-Path $PSScriptRoot "hook-permission.ps1")
Start-Sleep -Seconds 2

Write-Host "  2. Testing hook-stop.ps1..."
& (Join-Path $PSScriptRoot "hook-stop.ps1")
Start-Sleep -Seconds 2

Write-Host "  3. Testing hook-subagent-stop.ps1..."
& (Join-Path $PSScriptRoot "hook-subagent-stop.ps1")
Start-Sleep -Seconds 2

# Test cooldown
Write-Host ""
Write-Host "Testing cooldown mechanism..." -ForegroundColor Yellow
Write-Host "  You should only hear ONE beep (second call is within cooldown)..."

& $scriptPath -Message "First alert" -CooldownSeconds 5
Start-Sleep -Milliseconds 500
& $scriptPath -Message "Second alert, should be blocked" -CooldownSeconds 5

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "All tests complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To customize voice alerts, edit the hook scripts in:" -ForegroundColor Cyan
Write-Host "  $PSScriptRoot" -ForegroundColor White
Write-Host ""
Write-Host "Available customization options:" -ForegroundColor Cyan
Write-Host "  - Message: The spoken text" -ForegroundColor White
Write-Host "  - Rate: Speech speed (-10 to 10, default 1)" -ForegroundColor White
Write-Host "  - Volume: Speaker volume (0-100, default 85)" -ForegroundColor White
Write-Host "  - CooldownSeconds: Min time between alerts (default 3)" -ForegroundColor White
Write-Host "  - Voice: TTS voice name (default 'Microsoft David Desktop')" -ForegroundColor White
