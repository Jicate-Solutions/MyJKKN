# ID cards — colour front, black back from ONE ribbon set

**Date:** 2026-10-01
**Module:** ID Cards (Windows print bridge `C:\jkkn-bridge\evolis_bridge.py`)
**Status:** cloud half SHIPPED in the repo; bridge v0.3.2 WRITTEN against the real v0.3.1 file (2026-10-03) — install at the station PC, not yet done.

## The fault

A YMCKO roll is rated 300 sets. Printing through MyJKKN gave about 150
cards per roll; printing the same card from the Evolis software did not.

| Measured 2026-10-01 | Value |
|---|---|
| Ribbon gauge at 09:21 | 88% = 264 sets left |
| Cards printed by the bridge until the roll ended (13:34) | 133 |
| Sets per card | 264 / 133 = 2 |
| Pickup → result per card (`result.reported_at`) | 84 s, p10–p90 82–87 s |
| Result → next pickup | 16 s (the poll interval) |

**Cause.** The bridge drives the printer through the Evolis SDK
(`evolis.PrintSession` → `set_image(FRONT)` / `set_image(BACK)` →
`print()`). An SDK session does **not** read the "Front / Back
combination" saved in Evolis Premium Suite (`YMCO / K`). With both faces
set and no duplex type given, it prints both faces in colour: one full
Y-M-C-K-O set for the front and a second full set for the back. Ribbon is
consumed per panel pass, not per amount of ink, so a black-only back still
costs a whole set. Two colour passes also explain the 84 s per card.

The Evolis software prints through the Windows driver, which does apply
`YMCO / K` — which is why "the printer software has no issue".

## The fix

Tell the SDK session what the driver already knows: colour front, mono
back, from the same set (`YMCO / K`).

### Cloud half (in the repo, no station visit)

- `GET …/render?side=back&format=png` (the bridge download) now returns a
  strictly black & white PNG — pure `#000` / `#fff`, 3-channel RGB. The
  ribbon's black resin panel prints black or nothing; greys and colour on
  the back are what a panel-picking station spends a colour set on.
  Previews are unchanged. (`monochromeBackForPrint`,
  `lib/id-cards/artwork-boost.server.ts`.)
- `POST …/jobs/:id/pickup` now carries
  `print_plan: { front: 'color', back?: 'monochrome' }` next to `has_back`.
  Additive; older bridges ignore it.

These do not save ribbon on their own. They make the back K-panel-ready.

### Bridge half (station PC — this is the one that saves ribbon)

**Status 2026-10-03:** the live bridge (v0.3.1, read from a copy of
`C:\jkkn-bridge`) confirms the cause in its own docstring: staging a back
image makes the SDK "fall back to the ribbon's default" duplex type, which
for YMCKO is colour on both faces. Nothing in the file ever sets
`GDuplexType`. `evolis_help.txt` in the same folder lists
`evolis.SettingKey`, so the setting is addressable.

**v0.3.2** is a full replacement file, `scripts/id-card-bridge/evolis_bridge.py`.
It differs from v0.3.1 in exactly one behaviour: after
`ps.set_image(CardFace.BACK, …)` — which is the call that resets the
duplex type — it runs `_force_mono_back(ps)`:

```python
key = getattr(evolis.SettingKey, "GDuplexType", None)
ok = ps.set_setting(key, "DUPLEX_CM")       # colour front / black back
print("[mono-back] GDuplexType=DUPLEX_CM accepted=…", flush=True)
```

Guarded and logged at every step: if the SDK lacks the key or rejects the
value, the card still prints the old two-set way and the log says so.
The front path, polling, retry and rate limit are byte-for-byte v0.3.1.

Install (station PC):

1. Copy `scripts/id-card-bridge/evolis_bridge.py` to
   `C:\jkkn-bridge\evolis_bridge.v0.3.2.py` and
   `scripts/id-card-bridge/install-mono-back.ps1` to `C:\jkkn-bridge\`.
2. `powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\install-mono-back.ps1`
   — backs up the live file, compile-checks the new one, swaps, restarts
   `JKKNPrintBridge`.
3. `rollback-mono-back.ps1` restores the newest backup. `probe-sdk.ps1` is
   read-only and prints the SDK's setting names if the log shows the key
   was not accepted.

## Verify — six cards settle it

1. Read the ribbon % in Evolis Premium Suite.
2. Print **6** cards from MyJKKN.
3. Read the % again.

| Drop | Meaning |
|---|---|
| about 2% | one set per card — fixed; 300 cards per roll |
| about 4% | still two sets — open `C:\jkkn-bridge\bridge-service.log`, read the `[mono-back]` lines, and send them with the `probe-sdk.ps1` output |

The queue confirms it without the gauge: pickup → result should fall from
84 s to roughly 40 s per card.

```sql
select percentile_cont(0.5) within group (order by
  extract(epoch from (result->>'reported_at')::timestamptz - picked_up_at))
from id_card_print_jobs
where status = 'printed' and picked_up_at > now() - interval '2 hours';
```

## Print timing

Per card today: 84 s printing (two colour passes) + 15 s bridge pause + ~1 s
poll = about 100 s, i.e. 36 cards an hour. v0.3.2 changes both parts:

| Part | v0.3.1 | v0.3.2 | Why |
|---|---|---|---|
| Printing (pickup → result) | 84 s | about 40 s | one colour pass + one black pass instead of two colour passes |
| Pause after each card | 15 s | 2 s | `ps.print()` returns only when the card is done, so the old "rate limit" was idle time; the physical cycle is the limit |
| Expected cycle | ~100 s | ~45 s | about 80 cards an hour; a 100-card class in ~75 min instead of ~2 h 45 min |

MyJKKN's batch-print estimate still uses the measured 100 s per card
(`MEASURED_SECONDS_PER_CARD`). Re-measure from the queue after the first
v0.3.2 batch and lower it then; do not guess it down beforehand.

## Known trade-off

`YMCO / K` gives the front no black panel: black text on the front is
composed from Y, M and C and prints a little lighter than resin black. A
YMCKO-K ribbon (250 cards) gives resin black on both faces; that is a
purchasing choice, not a code one.

## If `GDuplexType` / `DUPLEX_CM` are not the names on this SDK

`probe-sdk.ps1` lists the real ones. The setting wanted is "duplex type =
colour front, monochrome back"; on the Evolis driver family the values are
`DUPLEX_CC`, `DUPLEX_CM`, `DUPLEX_MC`, `DUPLEX_MM`. Edit the two string
literals in the helper inside `evolis_bridge.py` and restart the service.
