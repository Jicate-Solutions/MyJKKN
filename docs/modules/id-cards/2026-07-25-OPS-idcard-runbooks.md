# ID Cards — Ops Runbooks

**Date:** 2026-07-25
**Category:** OPS
**Module:** ID Cards (print queue + Windows print bridge)
**Audience:** Director (executes), Claude sessions (prepare paste blocks)

Three runbooks:

1. [AGENT_PRINT_TOKEN rotation](#1-agent_print_token-rotation)
2. [Bridge `get_state()` v0.4 prep](#2-bridge-get_state-v04-prep--prepared-not-executed)
3. [Duplex enable (both sides)](#3-duplex-enable-both-sides--prepared-requires-directors-windows-session)

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

## 3. Duplex enable (both sides) — PREPARED, requires Director's Windows session

> **PREPARED — execution requires the Director at the Windows box; never
> run from the Mac.** Nothing in this section has been applied to the
> bridge.
>
> **Status 2026-08-14 — the original blocker is HALF CLEARED.** When this
> runbook was written, the back was dark on both sides of the wire: the
> cloud could render a back, but no production template had one and the
> bridge could not ask for one. **The cloud half is now done.** Two
> production templates carry a designed back, the pickup response already
> reports `has_back`, and a back has been rendered and looked at with
> human eyes for the first time (2026-08-14) — it composes correctly, with
> the portrait card rotated into the 1014x638 landscape canvas.
> **The only remaining software blocker is `evolis_bridge.py` itself,
> still v0.3.1 and front-only.** Beyond that: the ribbon decision (§3.1)
> and the on-plastic flip-direction check (§3.2), neither of which is code.
>
> ⛔ **Not yet safe to print at scale.** The rendered back truncates the
> address — see §3.5. One verification card is fine; a cohort batch is
> not, until that lands.

**Context (locked facts):**

- The Primacy 2 at the office has the **dual-side module INSTALLED**
  (printer's own config report, 2026-07-23). The Director confirms it
  prints both sides by default — the gap is software only.
- **The policy already asks for two sides, and the bridge disagrees.**
  Read live from `platform_policies` on 2026-08-14:
  `id_card.printer.sides = 2`, `id_card.printer.ribbon_type = "YMCKO"`,
  `id_card.printer.model = "primacy_2"`. So nothing needs changing in the
  policy to enable duplex — the bridge is simply not honouring it yet.
- Back-side rendering is LIVE cloud-side since PR #2370:
  `GET /api/id-cards/templates/:tid/render?profile_id=...&side=back&`
  `format=png` returns the back PNG, or 404 `back_not_configured` while
  the template's `back_layout_json` is NULL. The SAME
  `AGENT_PRINT_TOKEN` bearer works — auth on that route runs before any
  side handling.
- **Duplex pickup contract — SHIPPED, read off `main` 2026-08-14.**
  `POST /api/id-cards/jobs/:id/pickup` returns the claimed job row plus
  `has_back: boolean`. True ⇔ the job's template has a non-null
  `back_layout_json` ⇔ `?side=back` will render with the same bearer.
  The lookup is **fail-soft**: if the template read errors, the claim
  still succeeds and `has_back` comes back false, so the duplex hint can
  never block a pickup or strand a job. Old bridges ignore the field
  (front-only, unchanged). Bridge rule: `claim.get("has_back", False)`
  so an old cloud (missing key) also means front-only.

**Which templates have a back — read live from `id_card_templates`,
2026-08-14 (3 rows in the table, all of production):**

```
active  back_layout_json           template
------  -------------------------  ------------------------------------------
yes     11 elements, portrait      Engineering Learner - Tall (2026)
                                   ad0642ec-10c5-4b06-859e-7006734eb8f8
yes     11 elements, portrait      Engineering Senior Learner (Facilitator)
                                   - Tall (2026)
                                   138ea0e4-11ec-4ac2-aa58-060ec888b3aa
no      NULL                       DO NOT USE - E2E Test Template (2026-07-23)
                                   79cb8a5b-e1bd-465d-b587-1370945890cd
```

The two backs are byte-identical to each other (1,281 bytes as compact
JSON, measured 2026-08-14). Only the inactive E2E row is still NULL — so
`back_not_configured` is now the exception in production, not the rule.

**What the live back actually contains.** Both backs are driven ENTIRELY
by their 11 positioned `elements`; every default block is switched OFF
(`show_blood_group`, `show_dob`, `show_guardian`, `show_address`,
`show_contact` and `show_barcode` are all `false`). In particular
**`show_barcode` is `false` — there is no barcode on the printed back.**
The 11 elements are four label+value pairs (BLOOD GROUP, DATE OF BIRTH,
ADDRESS, CONTACT) plus three fixed lines (the three office phone numbers,
`engg@jkkn.ac.in`, `www.engg.jkkn.ac.in`), over the footer band
`TAMIL NADU, INDIA` — which reads as a green sidebar once the portrait
composition is rotated into the landscape canvas. This matters below: a
text-only mono back is **more** favourable to YMCKOK than §3.1 originally
assumed.

### 3.1 SDK duplex flow

One `PrintSession`, both faces set, ONE `print()` call:

```python
ps = evolis.PrintSession(co)
ps.set_image(evolis.CardFace.FRONT, front_bmp_path)
ps.set_image(evolis.CardFace.BACK, back_bmp_path)
ps.print()
```

This matches the locked SDK notes (`ps.set_image(CardFace.FRONT, path)`
+ `ps.print()`; the built-in test card's type=0 is explicitly "dual-side").
**Confirm on-box before locking the diff:** `help(evolis.CardFace)` for
the exact BACK member name, and whether duplex needs an explicit print
setting or auto-enables when both faces have images (check
`help(evolis.PrintSession)` for duplex/side settings).

**Ribbon math — a purchasing decision, not a code decision.**

| Ribbon | What one duplex card costs | Cards per ribbon |
|---|---|---|
| **YMCKO** — loaded today | a SECOND full panel set, for a colour back | ~244 front-only → roughly **~122** duplex |
| **YMCKOK** | the extra **K** panel only — ONE set per duplex card | duplex at roughly the front-only rate |

(The ~244 figure is this runbook's own existing capacity number; §2
records ~246 panels left on the loaded ribbon.)

The live back is **text-only with no barcode at all** (`show_barcode` is
`false` — see the context block above), so it needs no colour panels
whatsoever. YMCKOK is therefore the right ribbon for this design, and the
halving above is capacity paid for nothing. Raise it on the next
spare-ribbon order.

**Do not trust that estimate — measure it.** Read the printer's ribbon
percentage immediately BEFORE and immediately AFTER the first duplex
card. That one reading pair settles the true panel cost per duplex card
and is worth more than any figure written in this runbook.

### 3.2 Bridge pseudo-diff (v0.3.1 → duplex-aware)

Same rotation treatment as the front (RGB convert → rotate when
landscape → BMP), but through a SEPARATE constant so the flip direction
can be corrected independently if the first card's back comes out
inverted (the printer flips on one edge; whether the back needs +90 or
-90 is only provable on plastic):

```python
# NEW constant next to ROTATE_DEGREES=90:
#   BACK_ROTATE_DEGREES = 90   # flip to -90 if the first duplex
#                              # card's back is upside-down
#
# BEFORE (v0.3.1 — front only):
#   png = fetch_render(job, side="front")     # ?format=png
#   bmp = prep_image(png)                     # RGB + rotate + BMP
#   ps = evolis.PrintSession(co)
#   ps.set_image(evolis.CardFace.FRONT, bmp)
#   ps.print()
#
# AFTER (duplex-aware):
#   has_back = bool(claim.get("has_back", False))
#   front_bmp = prep_image(fetch_render(job, side="front"))
#   ps = evolis.PrintSession(co)
#   ps.set_image(evolis.CardFace.FRONT, front_bmp)
#   if has_back:
#       resp = fetch_render_raw(job, side="back")
#       if resp.status_code == 404:
#           # code=back_not_configured — template changed since
#           # claim; a front-only card is correct. Log and continue.
#           log("back no longer configured; printing front only")
#       elif not resp.ok:
#           # Transient back failure: retry once, then FAIL the job
#           # ("Back image download failed — click Retry") rather
#           # than burn a panel on a half-card. Mirrors the existing
#           # retry-once-then-fail model.
#           ...
#       else:
#           back_bmp = prep_image_back(resp.content)
#           ps.set_image(evolis.CardFace.BACK, back_bmp)
#   ps.print()                                # ONE call, both faces
```

Keep the front path byte-for-byte identical to v0.3.1 — a job with
`has_back` falsy must behave exactly as today. This diff composes with
the §2 `get_state()` probe swap; if both land in one box session, ship
them as a single v0.5 whole-file replacement.

**Two levers now correct back rotation — reach for the cloud one first.**
Since PR #2370's portrait engine, `back_layout_json.orientation` accepts
`portrait` (composition rotated +90°) or `portrait-flipped` (−90°), and
the back honours it independently of the front. Both live templates are
`portrait` today (read live 2026-08-14), matching their fronts.

- If the first duplex card's back comes out inverted, **flip that
  template's `back_layout_json.orientation` to `portrait-flipped`** — a
  one-row data change, no box visit, no service restart, and the next job
  picks it up.
- Keep `BACK_ROTATE_DEGREES` equal to `ROTATE_DEGREES` (90). It still
  earns its place: the printer flips the card on one edge, there are two
  rotation legs in series (cloud composition, then the bridge's own 90°
  at print time), and which leg is wrong is only provable on plastic. The
  constant is the bridge-side lever for the case where the cloud-side
  flip turns out not to be the one at fault.
- **Change ONE lever at a time.** Flipping both at once rotates the back
  a full 180° and teaches you nothing — the card comes back wrong in a
  new way and you have spent two pieces of plastic to learn it.

### 3.3 Paste-shuttle `.ps1` skeleton

Whole-file replacement, same pattern as §2.2 (marker-patching a file we
cannot see from the Mac is fragile). Windows Claude produces the FULL
updated `evolis_bridge.py`; the Director pastes it via Notepad. All
lines under 80 chars.

Save as `C:\jkkn-bridge\apply-duplex.ps1` via Notepad, run with:

```
powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\apply-duplex.ps1
```

```powershell
# apply-duplex.ps1 — evolis_bridge.py duplex (both sides)
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
Write-Host "Duplex bridge applied. Verify heartbeat from Mac."
```

Rollback: identical to §2.3 (`rollback-v04.ps1` pattern) — fill
`<BACKUP-FILENAME>` from this apply step's output.

### 3.4 Verification — the first duplex print is NOT free

1. Service running + heartbeat fresh (same free checks as §2.4 — do
   these FIRST; a wedged service costs nothing to catch).
2. Cloud contract check (free, from the Mac): enqueue NOTHING. Both
   active templates already carry a back, so the check is now the other
   way round — confirm `?side=back&format=png` returns 200 for one of
   them with the agent token, that the inactive E2E row still answers
   404 `back_not_configured`, and that a pickup response carries
   `has_back: true`.
3. **FIRST DUPLEX VERIFICATION PRINT — costs one card and burns panel(s),
   and needs the Director AT THE BOX:** one real job on a back-configured
   template. Check on the plastic: back present; back orientation matches
   the front (if not, flip the template's `back_layout_json.orientation`
   first — see §3.2 — and only then reach for `BACK_ROTATE_DEGREES`; that
   second card is also not free); all four label+value pairs legible; the
   three fixed contact lines present. **There is no barcode on this back
   — do not look for one, and do not treat its absence as a defect.**
   Read ribbon % before/after to learn true panel cost per duplex card.
4. Regression: one front-only job must print exactly as today — no back
   face, single panel set. Note the only NULL-back template left in
   production is the **inactive** E2E row, so this check needs either
   that row temporarily reactivated or a purpose-made template with
   `back_layout_json` left NULL. Do NOT clear the back off a live
   template to manufacture this check.

### 3.5 ⛔ Blocker before any duplex BATCH — the address is truncated

The back's ADDRESS value goes through the shared element render path,
which hard-truncates every element's text at 80 characters
(`truncateForCard(value, 80)` — `lib/id-cards/render-card.tsx:1399`; 79
characters kept, then an ellipsis).

Learner addresses are joined from five columns — street, taluk, district,
state, PIN. Measured live against production on 2026-08-14, across the
787 active learners of JKKN College of Engineering and Technology (the
institution that owns both back-configured templates):

- **402 of 787 — 51.1% — join to more than 80 characters.**
- Every one of those loses the tail, which is exactly where district,
  state and PIN sit.

A real address from that roll, at 101 characters:

```
stored : 214 MALAIKARAN KADU, CHINNA ANDIPATTI, ATTAYAMPATTY VIA
         RAJAPALAYAM, SALEM, SALEM, TAMIL NADU, 637501
on card: 214 MALAIKARAN KADU, CHINNA ANDIPATTI, ATTAYAMPATTY VIA
         RAJAPALAYAM, SALEM, SAL...
```

The card would carry a street and a village and then simply stop — no
district, no state, no PIN. **A separate lane is fixing the truncation.**
Until that ships:

- ✅ A single verification print is fine. It is proving rotation and
  panel cost, not address quality.
- ⛔ Do **not** run a cohort batch on the back. Roughly half the stack
  would come out with an unusable address, and cards are not reprintable
  for free.

Re-measure before the first batch. The fix is cloud-side so it costs no
box visit — but it does have to be live, and the 402/787 number above is
the check that tells you whether it is.

---

*Related: `docs/modules/id-cards/2026-07-24-MODULE-id-cards.md` (module
overview, architecture, job statuses).*
