# Permission Request Hook for Claude Code
# Triggers voice alert when Claude asks for user permission

try {
    # Optional: Read JSON input from stdin for advanced filtering
    # $input = $Input | Out-String | ConvertFrom-Json
    # Could filter by tool_name, message, etc.

    # Get path to voice alert script
    $scriptPath = Join-Path $PSScriptRoot "voice-alert.ps1"

    # Trigger voice alert with urgent settings
    & $scriptPath `
        -Message "Permission needed" `
        -Rate 2 `
        -Volume 100 `
        -CooldownSeconds 3

    # Always exit 0 to not block Claude Code
    exit 0

} catch {
    # Silent fail on error
    exit 0
}
