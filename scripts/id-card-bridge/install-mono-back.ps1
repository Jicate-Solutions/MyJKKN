# install-mono-back.ps1 - put the new bridge (colour front, black back from
# ONE ribbon set, front black via Y+M+C) on the station PC.
#
# 1. Copy evolis_bridge.new.py and this script into C:\jkkn-bridge.
# 2. Run:
#    powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\install-mono-back.ps1
#
# Backs up the live bridge, installs the new file, compile-checks it, and
# restarts the JKKNPrintBridge service. Rolls back by itself if the compile
# check fails. rollback-mono-back.ps1 restores the newest backup at any time.

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
$live = "$dir\evolis_bridge.py"
$new = "$dir\evolis_bridge.new.py"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "$dir\evolis_bridge.py.bak-$stamp"
$pyexe = "C:\Users\Admin\AppData\Local\Programs\Python" `
  + "\Python311\python.exe"

if (-not (Test-Path $new)) {
  Write-Host "Copy the new bridge to $new first - nothing changed."
  exit 1
}
if (-not (Select-String -Path $new -Pattern "_force_mono_back" -Quiet)) {
  Write-Host "$new is not the new bridge - nothing changed."
  exit 1
}

& $pyexe -X utf8 -m py_compile $new
if ($LASTEXITCODE -ne 0) {
  Write-Host "New bridge does not compile - nothing changed."
  exit 1
}

net stop JKKNPrintBridge
if ($LASTEXITCODE -ne 0) {
  Write-Host "Could not stop JKKNPrintBridge (exit $LASTEXITCODE) - nothing changed."
  exit 1
}
Copy-Item $live $bak
Write-Host "Backup: $bak"
Copy-Item $new $live -Force
net start JKKNPrintBridge
if ($LASTEXITCODE -ne 0) {
  Write-Host "Service did not start - restoring the backup."
  Copy-Item $bak $live -Force
  net start JKKNPrintBridge
  exit 1
}
Select-String -Path $live -Pattern "bridge \(v[0-9.]+" |
  Select-Object -First 1 |
  ForEach-Object { Write-Host ("Running bridge file: " + $_.Matches[0].Value.Replace("bridge (", "")) }

Write-Host "New bridge installed and restarted."
Write-Host "Now: note the ribbon %, print 6 cards, note it again."
Write-Host "Expect about 2% down (one set per card)."
Write-Host "Log: $dir\bridge-service.log - look for"
Write-Host "  [mono-back] GDuplexType=DUPLEX_CM accepted=True now=DUPLEX_CM"
Write-Host "  [mono-back] FBlackManagement=NOBLACKPOINT accepted=True now=NOBLACKPOINT"
