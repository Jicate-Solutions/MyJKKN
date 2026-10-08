# switch-print-route.ps1 - choose how the bridge sends cards to the printer.
#
#   powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\switch-print-route.ps1 driver
#   powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\switch-print-route.ps1 sdk
#
# "driver" = Windows printer driver, the same path as the Evolis design
#            software (uses the Premium Suite preferences: YMCO / K).
#            Needs pywin32 - this script installs it if missing.
# "sdk"    = Evolis SDK (the default).
# Writes C:\jkkn-bridge\print-via.txt and restarts the service.

param([ValidateSet("driver", "sdk")][string]$Route = "driver")

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
$pyexe = "C:\Users\Admin\AppData\Local\Programs\Python" `
  + "\Python311\python.exe"

if ($Route -eq "driver") {
  & $pyexe -c "import win32print, win32ui" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing pywin32..."
    & $pyexe -m pip install pywin32
    & $pyexe -c "import win32print, win32ui"
    if ($LASTEXITCODE -ne 0) {
      Write-Host "pywin32 did not install - route NOT changed."
      exit 1
    }
  }
}

Set-Content -Path "$dir\print-via.txt" -Value $Route -Encoding ASCII
net stop JKKNPrintBridge
net start JKKNPrintBridge
Write-Host "Print route is now: $Route (see 'via=' in bridge-service.log)."
