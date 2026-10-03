# apply-mono-back.ps1 - colour front + BLACK back from ONE ribbon set.
#
# WHY: evolis_bridge.py prints through the Evolis SDK. An SDK print
# session ignores the "Front / Back combination" saved in Evolis Premium
# Suite (YMCO / K) and prints BOTH faces in full colour, so every card
# burns TWO ribbon sets: 150 cards per YMCKO roll instead of 300, and
# about 84 s per card instead of about 40 s. Measured 2026-10-01: 133
# cards consumed 264 sets.
#
# WHAT: adds a helper to evolis_bridge.py and calls it right after each
# print session is created. The helper (a) loads the driver settings so
# the Premium Suite choice applies and (b) sets the duplex type to
# colour-front / mono-back explicitly. Every step is try/except and
# logged; a setting the SDK does not know can never stop a print.
#
# SAFE: backup first, compile check before restart, auto-rollback on a
# compile failure. Changes nothing if the file is already patched or the
# session line cannot be found.
#
#   powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\apply-mono-back.ps1

$dir = "C:\jkkn-bridge"
$py = "$dir\evolis_bridge.py"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "$dir\evolis_bridge.py.bak-$stamp"
$pyexe = "C:\Users\Admin\AppData\Local\Programs\Python" `
  + "\Python311\python.exe"

if (-not (Test-Path $py)) {
  Write-Host "Not found: $py - nothing changed."
  exit 1
}

$lines = [System.IO.File]::ReadAllLines($py)
if (($lines -join "`n") -match "_apply_mono_back") {
  Write-Host "Already patched - nothing changed."
  exit 0
}

$helper = @'

def _apply_mono_back(session):
    """Colour front + black back from ONE ribbon set (YMCO / K).

    Added 2026-10-01. Without this the SDK session ignores the
    Front/Back combination saved in Evolis Premium Suite and prints
    both faces in colour: two ribbon sets per card.
    """
    try:
        session.init_from_driver_settings()
        print("[mono-back] driver settings loaded", flush=True)
    except Exception as exc:
        print("[mono-back] init_from_driver_settings: %r" % (exc,),
              flush=True)
    done = False
    try:
        key = evolis.SettingKey.GDuplexType
        ok = session.set_setting(key, "DUPLEX_CM")
        print("[mono-back] GDuplexType=DUPLEX_CM -> %r" % (ok,),
              flush=True)
        done = True
    except Exception as exc:
        print("[mono-back] SettingKey.GDuplexType: %r" % (exc,),
              flush=True)
    if not done:
        try:
            ok = session.set_setting("GDuplexType", "DUPLEX_CM")
            print("[mono-back] 'GDuplexType'=DUPLEX_CM -> %r" % (ok,),
                  flush=True)
        except Exception as exc:
            print("[mono-back] 'GDuplexType': %r" % (exc,), flush=True)

'@

$out = New-Object System.Collections.Generic.List[string]
$helperDone = $false
$calls = 0

foreach ($line in $lines) {
  $out.Add($line)

  # Helper goes right after the top-level "import evolis".
  if (-not $helperDone -and $line -match '^(import evolis|from evolis )') {
    foreach ($h in ($helper -split "`r?`n")) { $out.Add($h) }
    $helperDone = $true
    continue
  }

  # Call goes right after every "<name> = evolis.PrintSession(...)".
  if ($line -match '^(\s*)(\w+)\s*=\s*evolis\.PrintSession\(.*\)\s*(#.*)?$') {
    $out.Add($Matches[1] + "_apply_mono_back(" + $Matches[2] + ")")
    $calls++
  }
}

if (-not $helperDone) {
  Write-Host "No top-level 'import evolis' line - nothing changed."
  Write-Host "Run probe-sdk.ps1 and send its output."
  exit 1
}
if ($calls -lt 1) {
  Write-Host "No '<name> = evolis.PrintSession(...)' line - nothing changed."
  Write-Host "Run probe-sdk.ps1 and send its output."
  exit 1
}

net stop JKKNPrintBridge
Copy-Item $py $bak
Write-Host "Backup: $bak"

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($py, $out, $utf8)

& $pyexe -X utf8 -m py_compile $py
if ($LASTEXITCODE -ne 0) {
  Write-Host "py_compile FAILED - rolling back."
  Copy-Item $bak $py -Force
  net start JKKNPrintBridge
  exit 1
}

net start JKKNPrintBridge
Write-Host "Patched $calls print session(s). Bridge restarted."
Write-Host "Now: note the ribbon %, print 6 cards, note it again."
Write-Host "Expect a 2% drop (one set per card). 4% = not applied:"
Write-Host "open $dir\bridge-service.log and read the [mono-back] lines."
