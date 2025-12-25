# Stop Hook for Claude Code
# Triggers voice alert when main Claude agent finishes responding

try {
    # Optional: Read JSON input from stdin
    # $input = $Input | Out-String | ConvertFrom-Json

    # Get path to voice alert script
    $scriptPath = Join-Path $PSScriptRoot "voice-alert.ps1"

    # Trigger voice alert
    & $scriptPath `
        -Message "Task complete" `
        -Rate 1 `
        -Volume 90 `
        -CooldownSeconds 3

    # Always exit 0 to not block Claude Code
    exit 0

} catch {
    # Silent fail on error
    exit 0
}
