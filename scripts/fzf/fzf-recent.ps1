# Browse recently modified files (by git) with preview
# Usage: .\fzf-recent.ps1 [count]
# Requirements: fzf (winget install junegunn.fzf)

param(
    [int]$Count = 50
)

$projectRoot = (git rev-parse --show-toplevel 2>$null) ?? (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$recentFiles = git log --diff-filter=ACMR --name-only --pretty=format: -n $Count |
    Where-Object { $_ -ne "" } |
    Sort-Object -Unique |
    Where-Object { Test-Path (Join-Path $projectRoot $_) }

if (-not $recentFiles) {
    Write-Host "No recently modified files found." -ForegroundColor Yellow
    exit 0
}

$selected = $recentFiles |
    fzf --preview "bat --color=always --style=numbers --line-range=:80 `"$projectRoot/{}`" 2>NUL || Get-Content `"$projectRoot/{}`" -ErrorAction SilentlyContinue | Select-Object -First 80" `
        --header "Recently modified files (last $Count commits)" `
        --height 80% `
        --layout reverse `
        --border rounded `
        --preview-window "right:60%:wrap" `
        --prompt "recent> "

if ($selected) {
    $fullPath = Join-Path $projectRoot $selected.Replace("/", "\")
    Write-Host "Opening: $selected" -ForegroundColor Cyan
    code $fullPath
}
