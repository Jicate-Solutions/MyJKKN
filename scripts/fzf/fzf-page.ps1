# Navigate to any page/route in the MyJKKN app
# Usage: .\fzf-page.ps1
# Requirements: fzf (winget install junegunn.fzf)

$projectRoot = (git rev-parse --show-toplevel 2>$null) ?? (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$pages = Get-ChildItem -Path "$projectRoot\app" -Recurse -Filter "page.tsx" |
    ForEach-Object {
        $relativePath = $_.FullName.Replace("$projectRoot\", "").Replace("\", "/")
        $route = $relativePath -replace "^app/", "/" -replace "/page\.tsx$", "" -replace "\(routes\)/", "" -replace "\([^)]+\)/", ""
        [PSCustomObject]@{
            Route = $route
            File  = $relativePath
        }
    } |
    Sort-Object Route

$selected = $pages |
    ForEach-Object { "$($_.Route)  ::  $($_.File)" } |
    fzf --preview "bat --color=always --style=numbers --line-range=:60 `"$projectRoot/{2}`" 2>NUL || Get-Content `"$projectRoot/{}`" -ErrorAction SilentlyContinue | Select-Object -First 60" `
        --delimiter "::" `
        --header "Select a page (Route :: File)" `
        --height 80% `
        --layout reverse `
        --border rounded `
        --preview-window "right:55%:wrap" `
        --prompt "route> "

if ($selected) {
    $filePath = ($selected -split "::")[1].Trim()
    $fullPath = Join-Path $projectRoot $filePath.Replace("/", "\")
    Write-Host "Opening: $filePath" -ForegroundColor Cyan
    code $fullPath
}
