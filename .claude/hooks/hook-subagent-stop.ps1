# Subagent Stop Hook for Claude Code
# Triggers voice alert when a subagent (Task tool) finishes

try {
    # Optional: Read JSON input from stdin
    # $input = $Input | Out-String | ConvertFrom-Json

    # Get path to voice alert script
    $scriptPath = Join-Path $PSScriptRoot "voice-alert.ps1"

    # Trigger voice alert
    & $scriptPath `
        -Message "Agent finished" `
        -Rate 1 `
        -Volume 90 `
        -CooldownSeconds 3

    # Always exit 0 to not block Claude Code
    exit 0

} catch {
    # Silent fail on error
    exit 0
}
