# rollback-mono-back.ps1 - restore the bridge from before
# apply-mono-back.ps1. Uses the NEWEST evolis_bridge.py.bak-* file.
#
#   powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\rollback-mono-back.ps1

# Must run as Administrator: stopping/starting the service needs it. Without
# this, "net stop" fails with "System error 5 / Access is denied", the file
# is swapped but the OLD bridge keeps running (seen 2026-10-03).
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Run this in PowerShell opened AS ADMINISTRATOR (right-click -> Run as administrator). Nothing changed."
  exit 1
}

$dir = "C:\jkkn-bridge"
$py = "$dir\evolis_bridge.py"

$bak = Get-ChildItem "$dir\evolis_bridge.py.bak-*" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $bak) {
  Write-Host "No backup found in $dir - nothing changed."
  exit 1
}

Write-Host "Restoring: $($bak.FullName)"
net stop JKKNPrintBridge
Copy-Item $bak.FullName $py -Force
net start JKKNPrintBridge
Write-Host "Rolled back. Bridge restarted."
