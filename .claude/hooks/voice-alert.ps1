# Voice Alert Script for Claude Code
# Provides non-blocking TTS alerts with cooldown to prevent spam

param(
    [Parameter(Mandatory=$true)]
    [string]$Message,

    [Parameter(Mandatory=$false)]
    [int]$Rate = 1,

    [Parameter(Mandatory=$false)]
    [int]$Volume = 85,

    [Parameter(Mandatory=$false)]
    [int]$CooldownSeconds = 3,

    [Parameter(Mandatory=$false)]
    [string]$Voice = "Microsoft David Desktop"
)

try {
    # Cooldown mechanism to prevent alert spam
    $lockFile = Join-Path $env:TEMP "claude-voice-alert.lock"

    if (Test-Path $lockFile) {
        $lastAlert = (Get-Item $lockFile).LastWriteTime
        $elapsed = (Get-Date) - $lastAlert

        if ($elapsed.TotalSeconds -lt $CooldownSeconds) {
            # Too soon since last alert, skip
            exit 0
        }
    }

    # Update lock file timestamp
    Set-Content -Path $lockFile -Value (Get-Date) -Force

    # Initialize Text-to-Speech
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

    # Configure voice settings
    try {
        # Try to select preferred voice
        $synth.SelectVoice($Voice)
    } catch {
        # Fallback to default voice if preferred not found
        Write-Verbose "Voice '$Voice' not found, using default"
    }

    $synth.Rate = $Rate
    $synth.Volume = $Volume

    # Speak asynchronously (non-blocking)
    $synth.SpeakAsync($Message) | Out-Null

    # Wait a moment to ensure speech starts
    Start-Sleep -Milliseconds 100

    exit 0

} catch {
    # Fallback: System beep if TTS fails
    try {
        [Console]::Beep(800, 300)
    } catch {
        # Silent fail if no audio device
    }

    exit 0
}
