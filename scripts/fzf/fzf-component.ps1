# Browse React components across the project
# Usage: .\fzf-component.ps1
# Requirements: fzf (winget install junegunn.fzf)

$projectRoot = (git rev-parse --show-toplevel 2>$null) ?? (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$components = Get-ChildItem -Path $projectRoot -Recurse -Include "*.tsx" |
    Where-Object {
        $_.FullName -notmatch "node_modules" -and
        $_.FullName -notmatch "\.next" -and
        $_.Name -ne "page.tsx" -and
        $_.Name -ne "layout.tsx" -and
        $_.Name -ne "loading.tsx" -and
        $_.Name -ne "error.tsx"
    } |
    ForEach-Object {
        $_.FullName.Replace("$projectRoot\", "").Replace("\", "/")
    } |
    Sort-Object

$selected = $components |
    fzf --preview "bat --color=always --style=numbers --line-range=:80 `"$projectRoot/{}`" 2>NUL || Get-Content `"$projectRoot/{}`" -ErrorAction SilentlyContinue | Select-Object -First 80" `
        --header "Select a component (.tsx)" `
        --height 80% `
        --layout reverse `
        --border rounded `
        --preview-window "right:60%:wrap" `
        --prompt "component> "

if ($selected) {
    $fullPath = Join-Path $projectRoot $selected.Replace("/", "\")
    Write-Host "Opening: $selected" -ForegroundColor Cyan
    code $fullPath
}
