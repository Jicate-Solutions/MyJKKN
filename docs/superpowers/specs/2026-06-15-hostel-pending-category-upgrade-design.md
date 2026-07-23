# Hostel Category Upgrade — Pending-Category-on-Confirm Design

**Date:** 2026-06-15
**Module:** Campus Living → My Hostel (room category self-upgrade)
**Status:** Approved design — implementation plan to follow

## Problem

Today a category upgrade (Classic → Deluxe / Premium / Premium+AC) changes the
learner's `learners_profiles.hostel_category_id` only at the very end — once the
upgrade bill is fully paid AND the academic-fee threshold is met. The operator wants
the category to **reflect the upgrade as soon as the learner confirms it**, while the
room move and payment remain deferred and gated exactly as today.

## Decisions (confirmed)

1. **Approach B — staged pending category, not a destructive flip.** A new column
   `learners_profiles.pending_hostel_category_id` holds the in-flight target. The
   canonical `hostel_category_id` is promoted to the target only on real confirmation
   (paid + threshold). The UI shows the pending category immediately as "pending".
2. **Scope: both upgrade kinds** — room-pick (manual: →Premium / Premium+AC) and
   auto category-only (→Deluxe).
3. **Revert on non-payment** — if the hold deadline passes before confirmation, clear
   `pending` (the canonical category never changed, so nothing to undo), cancel the
   unpaid upgrade bill, release any held bed.
4. **Revert deadline** = the target category's existing `upgrade_hold_days` (default 5).
5. **Out of scope:** mess-category upgrades; base-fee re-billing.

## Why Approach B

Flipping the real `hostel_category_id` on confirm would leak an unpaid category to the
bill-generation batch (`campus_living_generate_hostel_year_bills` bills off category),
fighting the "revert on non-payment" rule. Staging into `pending_hostel_category_id`
keeps the canonical category honest — it becomes the new category only when the new
category is actually paid for. Confirmed safe: no trigger fires on `hostel_category_id`
(`trigger_detect_fee_dimension_change` ignores it), so staging has no billing side-effect.

## State machine

```
CONFIRM upgrade to T (current category C):
  pending_hostel_category_id := T          (hostel_category_id stays C)
  room-pick:  bed → reserved, waitlist held_bed set
  bill generated if threshold met (else deferred), hold_expires_at := now() + hold_days

  ├─ PAID + academic-threshold met (via receipt trigger → fn_cl_process_upgrade_holds)
  │     hostel_category_id := T ; pending := NULL
  │     room-pick: vacate old alloc → activate new alloc in held bed ; waitlist 'allocated'
  │     category-only: waitlist 'allocated'                                  [PERMANENT]
  │
  └─ HOLD DEADLINE passes first (cron → fn_cl_expire_upgrade_holds)
        pending := NULL ; unpaid bill cancelled ; held bed released ; waitlist 'expired'  [REVERTED]
```

## Data model

- `ALTER TABLE learners_profiles ADD COLUMN pending_hostel_category_id uuid NULL
   REFERENCES hostel_categories(id)`.
- Register in `types/supabase.ts` (Row/Insert/Update) and the learner-profile domain type.
- No `hostel_waitlist` change needed — `hostel_category_id` itself is the fallback.

## Touch-points (all additive; existing logic preserved)

| # | Function | Change |
|---|----------|--------|
| 1 | `fn_self_upgrade_room_category` | On confirm, also `SET pending_hostel_category_id = T`. Guard: reject if an upgrade is already `waiting` (cancel it first). |
| 2 | `fn_self_upgrade_category_only` | On confirm, `SET pending = T` **and** set `hold_expires_at = now()+hold_days` (none today). Immediate fee≤0 path still flips `hostel_category_id` directly (no pending). Same anti-stacking guard. |
| 3 | `_cl_execute_room_upgrade` | Where it sets `hostel_category_id = T`, also `pending = NULL`. |
| 4 | `fn_cl_process_upgrade_holds` (category-only loop B) | Where it sets `hostel_category_id = T`, also `pending = NULL`. |
| 5 | `fn_cl_expire_upgrade_holds` | On expiry, also clear `pending` (only when it equals the expiring target). **Broaden** to also expire category-only rows (`held_bed_id IS NULL`) past `hold_expires_at`: cancel unpaid bill, mark `expired`. |

Keying note: `hostel_waitlist.learner_id = profiles.id`; `pending_hostel_category_id`
lives on `learners_profiles.id`. Bridge via `profiles.learner_id` (1:1).

## Front-end

- **My Hostel hub / category display**: when `pending_hostel_category_id` is set, show
  e.g. *"Classic → Premium · pending payment"* instead of a bare category.
- **`room-category-upgrade-card.tsx`**: pending row already renders from the waitlist;
  lock the other options while any upgrade is `waiting` (prevent stacking). The "from → to"
  prefix reads the confirmed `hostel_category_id` (stays correct under B).
- Types: add `pending_hostel_category_id` to the learner-profile type used by My Hostel.

## Explicitly unchanged

- Room reservation / pay-to-confirm / academic-threshold mechanics.
- `fn_my_upgrade_room_categories` baseline (still the confirmed category — no change).
- Mess upgrades; base-fee bill generation.

## Edge cases

- **Threshold not met at confirm**: `pending` still set; bed reserved; bill deferred to
  when threshold is reached (existing behavior); deadline still governs revert.
- **Switch target while pending**: anti-stacking guard cancels the existing pending
  (clear pending, release bed, cancel bill) before starting the new one.
- **fee≤0 immediate upgrade**: confirm directly, no pending state.

## Verification (no test runner; verify via DB + browser)

- Confirm an upgrade → `pending` set, `hostel_category_id` unchanged, bed reserved.
- Pay + meet threshold → `hostel_category_id` promoted, `pending` cleared, room allocated.
- Let the hold expire → `pending` cleared, bill cancelled, bed released, no category change.
- Browser: My Hostel shows the pending badge through the cycle, for a non-super-admin
  resident of each kind (auto →Deluxe, room-pick →Premium/+AC).
