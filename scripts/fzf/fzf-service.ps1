# Browse and open service files with method preview
# Usage: .\fzf-service.ps1
# Requirements: fzf (winget install junegunn.fzf)

$projectRoot = (git rev-parse --show-toplevel 2>$null) ?? (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$servicesDir = Join-Path $projectRoot "lib" "services"

if (-not (Test-Path $servicesDir)) {
    Write-Host "No services directory found at: $servicesDir" -ForegroundColor Red
    exit 1
}

$services = Get-ChildItem -Path $servicesDir -Recurse -Filter "*-service.ts" |
    ForEach-Object {
        $_.FullName.Replace("$projectRoot\", "").Replace("\", "/")
    } |
    Sort-Object

$selected = $services |
    fzf --preview "bat --color=always --style=numbers --line-range=:100 `"$projectRoot/{}`" 2>NUL || Get-Content `"$projectRoot/{}`" -ErrorAction SilentlyContinue | Select-Object -First 100" `
        --header "Select a service file" `
        --height 80% `
        --layout reverse `
        --border rounded `
        --preview-window "right:60%:wrap" `
        --prompt "service> "

if ($selected) {
    $fullPath = Join-Path $projectRoot $selected.Replace("/", "\")
    Write-Host "Opening: $selected" -ForegroundColor Cyan
    code $fullPath
}
