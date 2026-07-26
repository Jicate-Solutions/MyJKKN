# ID Cards — Ops Runbooks

**Date:** 2026-07-25
**Category:** OPS
**Module:** ID Cards (print queue + Windows print bridge)
**Audience:** Director (executes), Claude sessions (prepare paste blocks)

Two runbooks:

1. [AGENT_PRINT_TOKEN rotation](#1-agent_print_token-rotation)
2. [Bridge `get_state()` v0.4 prep](#2-bridge-get_state-v04-prep--prepared-not-executed)

Secrets policy for this file: **placeholders only**. The real
`AGENT_PRINT_TOKEN` value was exposed in a transcript once and must NEVER
appear in any file, chat, or command output again. No runbook step below
ever prints, echoes, or reads back the token value.

---

## 1. AGENT_PRINT_TOKEN rotation

**Why:** the current token value was pasted through a chat transcript
(2026-07-24). Treat it as burned. Rotate at the next quiet window (no
print jobs mid-flight; check the queue is idle first).

**Moving parts that hold the token:**

| Holder | Where | Updated in step |
|---|---|---|
| Vercel prod env | `AGENT_PRINT_TOKEN` (Sensitive) | (b) |
| Windows service | `JKKNPrintBridge` via nssm `AppEnvironmentExtra` | (d) |
| User-level `setx` residue on the box | legacy from pre-service days | (d) |

Order matters: generate → Vercel → deploy → box → verify. Between the
deploy (c) and the box update (d) the bridge polls with the OLD token and
gets 401 — that window is expected and harmless (jobs just wait).

### (a) Generate the new value — locally, never echoed

```bash
openssl rand -hex 32
```

Run it on the Mac, read the value off the terminal with human eyes only.
Do not pipe it into a file, do not paste it into a Claude chat, do not
put it in a script. It travels only via interactive prompts (b) and the
Notepad-edited `.ps1` (d).

### (b) Vercel: replace the prod env var

Run from the production project directory in ONE shell line (`cd` does
not persist across tool calls, and vercel resolves the project from the
cwd's `.vercel/project.json` — verify you are in the MyJKKN prod project,
not a sibling):

```bash
vercel env rm AGENT_PRINT_TOKEN production
vercel env add AGENT_PRINT_TOKEN production
```

At the interactive `add` prompt: paste the new value, and mark it
**Sensitive**. (Sensitive vars read back EMPTY from `vercel env pull` —
verify by behaviour in step (e), not by reading it back.)

### (c) Deploy — env-only changes do NOT ship via the hook

The deploy hook's `ignoreCommand` cancels builds with no code diff, so an
env-only change never reaches production by itself. Ship a one-line no-op
comment PR (e.g. a `// token rotated YYYY-MM-DD` comment in any deployed
file), merge it, and let the build carry the new env value live.

### (d) Windows box: update the service env

Prepared as a `.ps1` the Director pastes via Notepad and runs from an
elevated PowerShell — **never console-paste multi-line blocks** (the
console shreds them line-by-line), and keep every line under 80 chars.

Save as `C:\jkkn-bridge\rotate-token.ps1` via Notepad, then run:

```
powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\rotate-token.ps1
```

```powershell
# rotate-token.ps1 — JKKNPrintBridge token rotation
# SELF-GUARD: if you can still see <PASTE-NEW-VALUE> below,
# STOP. Replace it in Notepad with the real new token first.

$new = "<PASTE-NEW-VALUE>"
if ($new -like "*PASTE-NEW-VALUE*") {
  Write-Host "Placeholder not replaced. Aborting."
  exit 1
}

net stop JKKNPrintBridge

# NOTE: AppEnvironmentExtra REPLACES the whole extra-env set.
# The service also needs PYTHONUTF8 + PYTHONUNBUFFERED, so all
# three are set together. Omitting them would break the bridge.
C:\jkkn-bridge\nssm.exe set JKKNPrintBridge `
  AppEnvironmentExtra `
  AGENT_PRINT_TOKEN=$new `
  PYTHONUTF8=1 `
  PYTHONUNBUFFERED=1

# Clear the legacy user-level copy (pre-service residue).
setx AGENT_PRINT_TOKEN ""

net start JKKNPrintBridge
Write-Host "Done. Verify heartbeat from the Mac side."
```

### (e) Verify — 3-way

1. **Anon is still locked out** (from the Mac):

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
     https://www.jkkn.ai/api/id-cards/jobs
   ```

   Expect `401`.

2. **Bridge is alive on the NEW token:** heartbeat freshness via the
   `id_card_agent_status` table (read-only query; the jobs GET writes it
   on every bridge poll). `last_seen_at` must be under ~120 seconds old
   and advancing — the print-queue page's "Print bridge online" chip
   shows the same thing.

3. **Old token is dead:** a request presenting the OLD bearer value must
   get `401`. Since the old value must not be re-typed anywhere, the
   practical form of this check: if the box was NOT yet updated and its
   service log (`C:\jkkn-bridge\bridge-service.log`) shows 401s after the
   deploy, that IS the old-token-401 proof. If the box was already
   updated, confirm the Vercel env history shows the old var removed —
   there is no remaining holder of the old value to test with, by design.

If (2) fails: the box did not pick up the new value — re-check step (d)
ran, service restarted, and the self-guard did not abort silently.

---

## 2. Bridge `get_state()` v0.4 prep — PREPARED, NOT EXECUTED

> **PREPARED — execution requires the Director at the Windows box;
> never run from the Mac.** Nothing in this section has been applied.
> Every physical print burns a ribbon panel (~246 YMCKO panels left), so
> verification is service-status + heartbeat only — **NO test print**.

**Context (locked facts, bridge v0.3.1):**

- Bridge file: `C:\jkkn-bridge\evolis_bridge.py`, runs as Windows service
  `JKKNPrintBridge` (nssm 2.24, `C:\jkkn-bridge\nssm.exe`).
- v0.3.1 gates printing on the deprecated `is_open()` probe — kept
  because it is proven in prod. `get_state()` is the SDK-blessed
  replacement: returns `evolis.State` with Major/Minor enums that
  distinguish OFF vs OFFLINE vs BUSY variants (richer friendly-error
  mapping for the registrar-facing failure messages).
- Known SDK behaviours: `Connection(...)` never raises when the printer
  is unreachable ("no printer" is a state, not an exception), and
  constructor success proves nothing — so the readiness probe is the ONLY
  pre-print gate. Its fail-soft contract must survive the swap.

### 2.1 Python diff sketch

Replace the `is_open()` printer-readiness probe with a `get_state()`
equivalent, preserving fail-soft behaviour (any probe error = "not
ready" + human-readable detail; NEVER an uncaught exception in the poll
loop):

```python
# BEFORE (v0.3.1 shape — locate the readiness gate that does this):
#     if not co.is_open():
#         return fail_job("Printer not responding — check power")

# AFTER (v0.4):
def printer_ready(co):
    """get_state() probe. Fail-soft: (ready, detail)."""
    try:
        state = co.get_state()          # evolis.State
        major = getattr(state, "major", state)
        name = str(major)
        if "READY" in name.upper():
            return True, name
        return False, friendly_state(name)
    except Exception as exc:            # fail-soft, never crash loop
        return False, f"State probe failed: {exc}"

def friendly_state(name):
    """Map State enum names to registrar-facing messages."""
    u = name.upper()
    if "OFF" in u and "LINE" not in u:
        return "Printer is powered off — switch it on"
    if "OFFLINE" in u:
        return "Printer offline — check LAN cable / IP"
    if "BUSY" in u or "PRINTING" in u:
        return "Printer busy — job will retry"
    return f"Printer not ready ({name})"

# At the old gate site:
#     ready, detail = printer_ready(co)
#     if not ready:
#         return fail_job(detail)
```

Notes for whoever finalises the real diff ON THE BOX (Windows Claude,
fresh session, reading the actual v0.3.1 source):

- Exact enum member names must be confirmed on-box via
  `help(evolis.State)` before locking the `friendly_state` map — do not
  trust the sketch's substring guesses blindly.
- Keep the existing retry-once-then-fail-with-message job flow untouched;
  only the probe changes.
- Keep `ROTATE_DEGREES=90` image-prep path untouched.

### 2.2 Paste-shuttle `.ps1` (backup → apply → restart)

Whole-file replacement is the robust paste-shuttle pattern (marker-based
patching of a file we cannot see from the Mac is fragile). Flow: Windows
Claude on the box produces the FULL updated `evolis_bridge.py` from the
diff sketch above + the on-box v0.3.1 source; the Director pastes that
full content into the here-string via Notepad. No downloads, no internet
assumptions. All lines under 80 chars.

Save as `C:\jkkn-bridge\apply-v04.ps1` via Notepad, run with:

```
powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\apply-v04.ps1
```

```powershell
# apply-v04.ps1 — evolis_bridge.py v0.4 (get_state probe)
# SELF-GUARD: if the here-string below still contains
# <PASTE-FULL-UPDATED-evolis_bridge.py-HERE>, STOP and have
# Windows Claude fill it in first.

$dir = "C:\jkkn-bridge"
$py = "$dir\evolis_bridge.py"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "$dir\evolis_bridge.py.bak-$stamp"

$new = @'
<PASTE-FULL-UPDATED-evolis_bridge.py-HERE>
'@

if ($new -like "*PASTE-FULL-UPDATED*") {
  Write-Host "Placeholder not replaced. Aborting."
  exit 1
}

net stop JKKNPrintBridge
Copy-Item $py $bak
Write-Host "Backup: $bak"

Set-Content -Path $py -Value $new -Encoding UTF8

# Compile check BEFORE restarting the service.
$pyexe = "C:\Users\Admin\AppData\Local\Programs\Python" `
  + "\Python311\python.exe"
& $pyexe -X utf8 -m py_compile $py
if ($LASTEXITCODE -ne 0) {
  Write-Host "py_compile FAILED — rolling back."
  Copy-Item $bak $py -Force
  net start JKKNPrintBridge
  exit 1
}

net start JKKNPrintBridge
Write-Host "v0.4 applied. Verify heartbeat from the Mac."
```

### 2.3 Rollback block

Save as `C:\jkkn-bridge\rollback-v04.ps1` via Notepad. Fill the backup
filename from the apply step's output first (self-guard included):

```powershell
# rollback-v04.ps1 — restore pre-v0.4 bridge
# SELF-GUARD: replace <BACKUP-FILENAME> with the .bak-* name
# printed by apply-v04.ps1 before running. If still a
# placeholder, STOP.

$dir = "C:\jkkn-bridge"
$bak = "$dir\<BACKUP-FILENAME>"

if ($bak -like "*BACKUP-FILENAME*") {
  Write-Host "Placeholder not replaced. Aborting."
  exit 1
}
if (-not (Test-Path $bak)) {
  Write-Host "Backup not found: $bak. Aborting."
  exit 1
}

net stop JKKNPrintBridge
Copy-Item $bak "$dir\evolis_bridge.py" -Force
net start JKKNPrintBridge
Write-Host "Rolled back to $bak"
```

### 2.4 Verification (NO test print)

1. Service running: `nssm.exe status JKKNPrintBridge` reports
   `SERVICE_RUNNING` (or `Get-Service JKKNPrintBridge`).
2. Heartbeat fresh: from the Mac, `id_card_agent_status.last_seen_at`
   under ~120 s and advancing across two reads ~30 s apart (the same
   check as the print-queue "Print bridge online" chip).
3. Log clean: tail `C:\jkkn-bridge\bridge-service.log` — poll cycles
   resume, no tracebacks, no 401s.
4. **Do NOT print a test card.** Every print (including the SDK built-in
   test card) burns a ribbon panel. Readiness-probe behaviour with a
   powered-off printer can be exercised for free: the probe should log
   the friendly "powered off" message and mark nothing failed until a
   real job arrives.

---

*Related: `docs/modules/id-cards/2026-07-24-MODULE-id-cards.md` (module
overview, architecture, job statuses).*
