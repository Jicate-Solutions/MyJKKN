# Browse and preview Supabase migration files with fzf
# Usage: .\fzf-migration.ps1
# Requirements: fzf (winget install junegunn.fzf)

$projectRoot = (git rev-parse --show-toplevel 2>$null) ?? (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$migrationsDir = Join-Path $projectRoot "supabase" "migrations"

if (-not (Test-Path $migrationsDir)) {
    Write-Host "No migrations directory found at: $migrationsDir" -ForegroundColor Red
    exit 1
}

$migration = Get-ChildItem "$migrationsDir\*.sql" |
    Sort-Object Name -Descending |
    ForEach-Object { $_.Name } |
    fzf --preview "bat --color=always --style=numbers --line-range=:80 `"$migrationsDir/{}`" 2>NUL || Get-Content `"$migrationsDir/{}`" | Select-Object -First 80" `
        --header "Select a Supabase migration (newest first)" `
        --height 80% `
        --layout reverse `
        --border rounded `
        --preview-window "right:60%:wrap"

if ($migration) {
    $fullPath = Join-Path $migrationsDir $migration
    Write-Host "`nSelected: $migration" -ForegroundColor Cyan
    Write-Host "Path: $fullPath`n" -ForegroundColor DarkGray

    $action = @("View in terminal", "Open in VS Code", "Copy path to clipboard") |
        fzf --header "What do you want to do?" --height 20% --layout reverse --border

    switch ($action) {
        "View in terminal"        { bat --color=always --style=numbers $fullPath 2>$null ?? (Get-Content $fullPath) }
        "Open in VS Code"         { code $fullPath }
        "Copy path to clipboard"  { $fullPath | Set-Clipboard; Write-Host "Copied to clipboard!" -ForegroundColor Green }
    }
}
