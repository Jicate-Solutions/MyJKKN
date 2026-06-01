# Browse TypeScript type definition files
# Usage: .\fzf-type.ps1
# Requirements: fzf (winget install junegunn.fzf)

$projectRoot = (git rev-parse --show-toplevel 2>$null) ?? (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$typesDir = Join-Path $projectRoot "types"

if (-not (Test-Path $typesDir)) {
    Write-Host "No types directory found at: $typesDir" -ForegroundColor Red
    exit 1
}

$types = Get-ChildItem -Path $typesDir -Recurse -Filter "*.ts" |
    ForEach-Object {
        $_.FullName.Replace("$projectRoot\", "").Replace("\", "/")
    } |
    Sort-Object

$selected = $types |
    fzf --preview "bat --color=always --style=numbers --line-range=:100 `"$projectRoot/{}`" 2>NUL || Get-Content `"$projectRoot/{}`" -ErrorAction SilentlyContinue | Select-Object -First 100" `
        --header "Select a type definition file" `
        --height 80% `
        --layout reverse `
        --border rounded `
        --preview-window "right:60%:wrap" `
        --prompt "type> "

if ($selected) {
    $fullPath = Join-Path $projectRoot $selected.Replace("/", "\")
    Write-Host "Opening: $selected" -ForegroundColor Cyan
    code $fullPath
}
