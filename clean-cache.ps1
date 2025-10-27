# Clean Next.js and webpack cache
Write-Host "Cleaning Next.js cache..." -ForegroundColor Yellow

# Stop any running Next.js processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*MyJKKN*" } | Stop-Process -Force -ErrorAction SilentlyContinue

# Clear .next cache
if (Test-Path ".next\cache") {
    Remove-Item -Recurse -Force ".next\cache"
    Write-Host "✓ Cleared .next\cache" -ForegroundColor Green
}

# Clear .next directory (optional - full rebuild)
# if (Test-Path ".next") {
#     Remove-Item -Recurse -Force ".next"
#     Write-Host "✓ Cleared .next directory" -ForegroundColor Green
# }

# Clear node_modules cache
if (Test-Path "node_modules\.cache") {
    Remove-Item -Recurse -Force "node_modules\.cache"
    Write-Host "✓ Cleared node_modules\.cache" -ForegroundColor Green
}

# Clear TypeScript cache
if (Test-Path ".tsbuildinfo") {
    Remove-Item -Force ".tsbuildinfo"
    Write-Host "✓ Cleared .tsbuildinfo" -ForegroundColor Green
}

Write-Host "`nCache cleaned successfully! Run 'npm run dev' to restart." -ForegroundColor Green
