# Browse React Query hooks in the project
# Usage: .\fzf-hook.ps1
# Requirements: fzf (winget install junegunn.fzf)

$projectRoot = (git rev-parse --show-toplevel 2>$null) ?? (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$hooksDir = Join-Path $projectRoot "lib" "hooks"

if (-not (Test-Path $hooksDir)) {
    Write-Host "No hooks directory found at: $hooksDir" -ForegroundColor Red
    exit 1
}

$hooks = Get-ChildItem -Path $hooksDir -Recurse -Filter "*.ts" |
    ForEach-Object {
        $_.FullName.Replace("$projectRoot\", "").Replace("\", "/")
    } |
    Sort-Object

$selected = $hooks |
    fzf --preview "bat --color=always --style=numbers --line-range=:80 `"$projectRoot/{}`" 2>NUL || Get-Content `"$projectRoot/{}`" -ErrorAction SilentlyContinue | Select-Object -First 80" `
        --header "Select a hook file" `
        --height 80% `
        --layout reverse `
        --border rounded `
        --preview-window "right:60%:wrap" `
        --prompt "hook> "

if ($selected) {
    $fullPath = Join-Path $projectRoot $selected.Replace("/", "\")
    Write-Host "Opening: $selected" -ForegroundColor Cyan
    code $fullPath
}
