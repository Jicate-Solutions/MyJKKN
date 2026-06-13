# Interactive grep across the codebase with live preview
# Usage: .\fzf-grep.ps1 [initial-query]
# Requirements: fzf (winget install junegunn.fzf), rg (winget install BurntSushi.ripgrep.MSVC)

param(
    [string]$InitialQuery = ""
)

$projectRoot = (git rev-parse --show-toplevel 2>$null) ?? (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

# Uses rg (ripgrep) for fast searching + fzf for interactive filtering
# Type to search -> results update live -> select to open in VS Code
$selected = $null

if ($InitialQuery) {
    $selected = rg --color=always --line-number --no-heading --smart-case $InitialQuery $projectRoot `
        --glob "!node_modules" --glob "!.next" --glob "!.git" --glob "!*.lock" |
        fzf --ansi `
            --header "Grep results for: $InitialQuery (select to open)" `
            --height 80% `
            --layout reverse `
            --border rounded `
            --delimiter ":" `
            --preview "bat --color=always --style=numbers --highlight-line {2} --line-range {2}: `"{1}`" 2>NUL || Get-Content `"{1}`" -ErrorAction SilentlyContinue | Select-Object -First 80" `
            --preview-window "right:60%:wrap:+{2}-20" `
            --prompt "filter> "
} else {
    Write-Host "Usage: .\fzf-grep.ps1 <search-term>" -ForegroundColor Yellow
    Write-Host "Example: .\fzf-grep.ps1 `"useAuth`"" -ForegroundColor DarkGray
    exit 0
}

if ($selected) {
    $parts = $selected -split ":"
    $file = $parts[0]
    $line = $parts[1]
    Write-Host "Opening: $file at line $line" -ForegroundColor Cyan
    code --goto "${file}:${line}"
}
