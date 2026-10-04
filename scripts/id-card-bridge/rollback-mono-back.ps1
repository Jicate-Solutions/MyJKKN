# rollback-mono-back.ps1 - restore the bridge from before
# apply-mono-back.ps1. Uses the NEWEST evolis_bridge.py.bak-* file.
#
#   powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\rollback-mono-back.ps1

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
