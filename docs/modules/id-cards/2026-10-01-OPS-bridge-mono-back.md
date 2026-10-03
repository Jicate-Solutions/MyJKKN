# ID cards — colour front, black back from ONE ribbon set

**Date:** 2026-10-01
**Module:** ID Cards (Windows print bridge `C:\jkkn-bridge\evolis_bridge.py`)
**Status:** cloud half SHIPPED in the repo; bridge half PREPARED — run at the station PC.

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

Three scripts in `scripts/id-card-bridge/`. Copy them to `C:\jkkn-bridge\`.

1. **`probe-sdk.ps1`** — read-only, uses no ribbon. Prints how the bridge
   builds its print session and what the installed SDK calls its duplex
   settings. Run it first and keep the output.
2. **`apply-mono-back.ps1`** — backs up `evolis_bridge.py`, adds a helper,
   calls it right after every `… = evolis.PrintSession(…)`, compile-checks,
   restarts `JKKNPrintBridge`. The helper:
   - `session.init_from_driver_settings()` — the Premium Suite choice
     (including its colour tuning) now applies to bridge jobs;
   - `session.set_setting(SettingKey.GDuplexType, "DUPLEX_CM")` — colour
     front / mono back, stated explicitly, with a string-key fallback.
   Every step is `try/except` and logged as `[mono-back] …`; a name the
   SDK does not know can never stop a print. The script changes nothing
   if the file is already patched or it cannot find the session line.
3. **`rollback-mono-back.ps1`** — restores the newest backup.

```
powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\probe-sdk.ps1
powershell -ExecutionPolicy Bypass -File C:\jkkn-bridge\apply-mono-back.ps1
```

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
