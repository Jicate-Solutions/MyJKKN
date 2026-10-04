# install-mono-back.ps1 - put bridge v0.3.2 (colour front, black back from
# ONE ribbon set) on the station PC.
#
# 1. Copy this folder's evolis_bridge.py next to this script in C:\jkkn-bridge.
# 2. Run:
#    powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\install-mono-back.ps1
#
# Backs up the live bridge, installs the new file, compile-checks it, and
# restarts the JKKNPrintBridge service. Rolls back by itself if the compile
# check fails. rollback-mono-back.ps1 restores the newest backup at any time.

$dir = "C:\jkkn-bridge"
$live = "$dir\evolis_bridge.py"
$new = "$dir\evolis_bridge.v0.3.2.py"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "$dir\evolis_bridge.py.bak-$stamp"
$pyexe = "C:\Users\Admin\AppData\Local\Programs\Python" `
  + "\Python311\python.exe"

if (-not (Test-Path $new)) {
  Write-Host "Copy the new bridge to $new first - nothing changed."
  exit 1
}
if (-not (Select-String -Path $new -Pattern "_force_mono_back" -Quiet)) {
  Write-Host "$new is not the v0.3.2 bridge - nothing changed."
  exit 1
}

& $pyexe -X utf8 -m py_compile $new
if ($LASTEXITCODE -ne 0) {
  Write-Host "New bridge does not compile - nothing changed."
  exit 1
}

net stop JKKNPrintBridge
Copy-Item $live $bak
Write-Host "Backup: $bak"
Copy-Item $new $live -Force
net start JKKNPrintBridge

Write-Host "Bridge v0.3.2 installed and restarted."
Write-Host "Now: note the ribbon %, print 6 cards, note it again."
Write-Host "Expect about 2% down (one set per card)."
Write-Host "Log: $dir\bridge-service.log - look for"
Write-Host "  [mono-back] GDuplexType=DUPLEX_CM accepted=True now=DUPLEX_CM"
