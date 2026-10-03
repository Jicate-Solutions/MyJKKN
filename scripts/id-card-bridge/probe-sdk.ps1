# probe-sdk.ps1 - READ ONLY. Prints nothing on plastic, uses no ribbon.
#
# Shows (1) how evolis_bridge.py creates its print session and
# (2) what the installed Evolis SDK calls the duplex settings.
# Run this FIRST and keep the output; apply-mono-back.ps1 relies on it.
#
#   powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\probe-sdk.ps1

$dir = "C:\jkkn-bridge"
$py = "$dir\evolis_bridge.py"
$pyexe = "C:\Users\Admin\AppData\Local\Programs\Python" `
  + "\Python311\python.exe"

Write-Host "=== 1. Print-session lines in evolis_bridge.py ==="
Select-String -Path $py -Pattern `
  "PrintSession|set_image|set_setting|init_from_driver|\.print\(" |
  ForEach-Object { "{0,5}: {1}" -f $_.LineNumber, $_.Line.TrimEnd() }

Write-Host ""
Write-Host "=== 2. Evolis SDK members ==="
$code = @'
import evolis
ps = [m for m in dir(evolis.PrintSession) if not m.startswith("_")]
print("PrintSession:", ", ".join(ps))
keys = getattr(evolis, "SettingKey", None)
if keys is None:
    print("SettingKey: NOT PRESENT (settings take string keys)")
else:
    want = ("Duplex", "Ribbon", "Black", "Mono")
    hits = [k for k in dir(keys) if any(w in k for w in want)]
    print("SettingKey matches:", ", ".join(hits))
print("evolis version:", getattr(evolis, "__version__", "unknown"))
'@
$tmp = "$dir\_probe_sdk.py"
Set-Content -Path $tmp -Value $code -Encoding UTF8
& $pyexe -X utf8 $tmp
Remove-Item $tmp -ErrorAction SilentlyContinue
