# Campus Living — Self-Service Category Upgrade + Auto Re-Billing

**Date:** 2026-06-09
**Status:** Design approved (pending spec review)
**Area:** Campus Living → My Hostel, Program Eligibility, Fee Config, Billing

---

## 1. Goal

After auto-allocation, let a **hostel resident self-upgrade** their **room category** and/or
**mess category** (independently) from the **My Hostel** module. The upgrade is **instant,
no warden approval**, gated by the **Program-Eligibility physical-room rules** and **live bed
availability**. On a successful upgrade the resident's category FK changes and their **bill is
automatically re-issued** from the category-wise amounts already set in **Fee Config** — room
and mess billed as **separate** lines. If the resident is eligible but **no bed is available**,
they join the existing **hostel waitlist** (their current category, allocation and bill stay
unchanged).

### Locked decisions

| # | Decision |
|---|----------|
| Room upgrade | Pick an available bed in the new category + **physically move** (vacate old, occupy new). |
| Approval | **None** — pure self-service, applied instantly. |
| Gates | (1) Program-Eligibility rule satisfied (`fn_learner_eligible_for_room`); (2) an eligible bed is available. |
| No bed available | Add to `hostel_waitlist` (target category), **keep existing category/bill**. |
| Mess upgrade | Always instant (no room/bed, so no availability gate, no waitlist). |
| Bill update | **Supersede** the old category bill + **auto-create a new full-amount bill** for the new category (current hostel year, from Fee Config). Room & mess independent. |
| Direction | **Upgrade only** — new category fee must be ≥ current. |
| Waitlist fulfillment | **D1 — self-complete**: entry records intent + position; when a bed opens, the resident self-completes via the same flow. (Auto-promote-on-vacancy = future follow-up.) |
| Waitlist storage | **Extend `hostel_waitlist`** with `target_hostel_category_id` + `entry_kind`. |

---

## 2. Current State (what already exists)

- **Category-wise fees** live in `hostel_fees` keyed by `hostel_year_id` + (`hostel_category_id`
  | `mess_category_id`), with `amount`/`frequency`/`is_active`. Managed in **Settings → Fee
  Config → Category Fees**. *No change needed — we only read these.*
- **A hosteller's bill** is driven by `learners_profiles.hostel_category_id` +
  `.mess_category_id` → `campus_living_resolve_hostel_fee()` → either a flat **package** line or
  **additive** room-category + mess-category lines → inserted as `billing_student_bills` rows by
  `campus_living_generate_hostel_year_bills()`.
- **`billing_student_bills` partial unique index** (the re-billing enabler):
  `UNIQUE (student_id, hostel_year_id, item_category_id) WHERE fee_source IN ('academic','hostel_category') AND status <> 'cancelled'`.
  → room and mess are **separate rows** (distinct `item_category_id`); cancelling a bill
  (`status='cancelled'`) frees its slot.
- **Room self-select flow** (`my-hostel/request-room` → `fn_self_request_room` →
  `fn_approve_allocation`) exists but (a) **blocks already-allocated learners**, (b) routes
  through **warden approval**, (c) **never updates the profile category or billing**. We do
  **not** reuse it directly; we add a dedicated upgrade RPC.
- **Atomic bed-move pattern** to mirror: `fn_premium_upgrade_accept` (advisory-lock bed →
  re-check available → vacate old allocation `status='vacated'` + free bed → insert new
  `active` allocation carrying tier/AY/institution/emergency fields → occupy new bed).
- **Reusable pure billing math**: `computeUpgradeDifferential()` in
  `hostel-fee-compute-service.ts` (not used for the primary full-amount path; available if a
  pro-rata variant is wanted later).
- **`hostel_waitlist` table** + `HostelWaitlistService` + `use-hostel-waitlist` hook + RLS
  exist (currently for first-allocation preferences). `waitlist_status_enum` =
  `waiting | offered | accepted | declined | expired | allocated`.

### Gap being filled
1. Already-allocated residents can't self-upgrade room category.
2. No mess-category change flow at all.
3. No bill re-issue on category change (generation dedups → would leave the old bill standing).

---

## 3. Architecture (layers)

```
My Hostel UI (Upgrade section in "My Category & Fees" tab)
  └─ hooks/campus-living/use-category-upgrade.ts            (React Query reads + mutations)
       └─ lib/services/campus-living/category-upgrade-service.ts  (thin RPC wrappers)
            └─ DB RPCs (SECURITY DEFINER, atomic):
                 fn_my_upgrade_room_categories()
                 fn_my_upgrade_mess_categories()
                 fn_self_upgrade_room_category(new_cat, room, bed)
                 fn_self_upgrade_mess_category(new_mess)
                 fn_self_join_upgrade_waitlist(target_cat)
                 _cl_apply_category_bill_change(...)   (internal billing helper)
            └─ hostel_waitlist (extended)  +  billing_student_bills  +  learners_profiles
```

---

## 4. Data Model Changes

### 4.1 `hostel_waitlist` (extend)

```sql
ALTER TABLE hostel_waitlist
  ADD COLUMN IF NOT EXISTS target_hostel_category_id uuid REFERENCES hostel_categories(id),
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'allocation';
-- entry_kind: 'allocation' (existing first-alloc preference rows) | 'upgrade' (new).
COMMENT ON COLUMN hostel_waitlist.target_hostel_category_id IS
  'For entry_kind=upgrade: the room category the resident wants to move up to.';
```

- Mirror into `supabase/setup/01_tables.sql`.
- Register the new columns in `types/supabase.ts` (the `hostel_waitlist` Row/Insert/Update
  shapes) so `.from('hostel_waitlist')` typechecks.
- **Upgrade entries**: `entry_kind='upgrade'`, `status='waiting'`, `target_hostel_category_id`
  set, `learner_id` = the resident, `academic_year_id` = current AY, `institution_id` = theirs.
  On self-complete the entry is set `status='allocated'` + `allocated_allocation_id` = the new
  allocation. (No auto-offer in v1.)
- **Dedup**: a resident may hold at most one active (`status='waiting'`) upgrade entry per
  `target_hostel_category_id`. Enforce in the RPC (re-request = no-op / refresh position).

### 4.2 No schema change to `learners_profiles`, `hostel_fees`, `billing_student_bills`.

---

## 5. Database Functions (RPCs)

All `SECURITY DEFINER`, `SET search_path = public`. Self-service gate: `user_is_hosteler()` +
the acting learner = `get_my_learner_id()` / `auth.uid()`. No new permission key (mirrors the
existing self-allocation RPCs; avoids the "reserved key needs role grants" gotcha). Bill inserts
run inside the definer RPC, so they bypass `bills_insert_admin` RLS legitimately on the
resident's behalf.

### 5.1 `fn_my_upgrade_room_categories()` → table

Returns one row per **self-selectable (`allocation_mode='manual'`) room category** that is an
**upgrade** for the caller:

| column | meaning |
|--------|---------|
| `category_id`, `name`, `type` | the category |
| `current_year_fee` | `hostel_fees.amount` for this category, current hostel year, `is_active` (null → not billable yet) |
| `is_eligible` | exists ≥1 room in this category the learner passes `fn_learner_eligible_for_room` for (gender + institution + program-eligibility), **ignoring** bed availability |
| `available_beds` | count of eligible **available** beds (reuses `fn_my_room_options` semantics) |

Filtered to `current_year_fee >= current_category_fee` (the **upgrade-only** rule) and excluding
the learner's current category. Current category fee = the resident's
`learners_profiles.hostel_category_id` fee for the current hostel year (0/none if unbilled).

UI uses it directly: `available_beds > 0` → "Upgrade now"; `is_eligible && available_beds = 0`
→ "Join waitlist"; `!is_eligible` → hidden/disabled with reason.

### 5.2 `fn_my_upgrade_mess_categories()` → table

One row per **active mess category** that is an upgrade (`fee >= current mess fee`), excluding
the current mess category. Columns: `mess_category_id`, `name`, `current_year_fee`. No
availability/eligibility gate (mess has no room).

### 5.3 `fn_self_upgrade_room_category(p_new_category_id, p_room_id, p_bed_id)` → jsonb

Atomic instant move + re-bill. Mirrors `fn_premium_upgrade_accept`:

1. Resolve `v_lp = get_my_learner_id()`, `v_profile = auth.uid()`; require `user_is_hosteler()`.
2. Validate target category is `manual` & active; target room is in that category & served to
   the learner's institution; block gender matches; `fn_learner_eligible_for_room(v_lp, room)`
   passes; bed belongs to room & is `available`; bed not already taken.
3. **Upgrade-only guard**: `fee(new_category) >= fee(current_category)` for the current hostel
   year, else `RAISE` ("Downgrades aren't allowed here").
4. `pg_try_advisory_xact_lock(hashtext(p_bed_id::text))` (first writer wins; else
   `bed_locked_by_other`).
5. Re-check bed still `available`.
6. Find caller's current `active` allocation (the seat being moved). If none → `no_active_allocation`.
7. **Move:** `UPDATE hostel_allocations SET status='vacated', actual_vacate_date=CURRENT_DATE`
   on the old; free old bed (`status='available'`, `current_occupant_id=NULL`). Insert new
   `active` allocation on the new room/bed carrying `tier_id`, `academic_year_id`,
   `institution_id`, emergency fields; occupy new bed (`status='occupied'`,
   `current_occupant_id`).
8. `UPDATE learners_profiles SET hostel_category_id = p_new_category_id` for `v_lp`.
9. **Re-bill (room component):** `_cl_apply_category_bill_change(v_lp, current_hostel_year,
   old_room_category_id, p_new_category_id, new_room_fee, new_category_name)`.
10. If the learner had a `waiting` upgrade entry for this category, mark it
    `status='allocated'`, `allocated_allocation_id = <new alloc>`.
11. Return `{ success, old_allocation_id, new_allocation_id, new_bed_id,
    old_category, new_category, old_fee, new_fee, bill_action }`.

> **Availability branch lives in the service/UI, not this RPC.** This RPC is the *commit* path
> (a bed is supplied). The "no bed → waitlist" branch calls `fn_self_join_upgrade_waitlist`
> instead (5.5). Keeping them separate means this RPC can never half-apply.

### 5.4 `fn_self_upgrade_mess_category(p_new_mess_category_id)` → jsonb

1. Require hosteller; validate mess category active; **upgrade-only** (`fee(new) >= fee(current)`).
2. `UPDATE learners_profiles SET mess_category_id = p_new_mess_category_id`.
3. `_cl_apply_category_bill_change(v_lp, current_hostel_year, old_mess_category_id,
   p_new_mess_category_id, new_mess_fee, new_mess_name)`.
4. Return `{ success, old_category, new_category, old_fee, new_fee, bill_action }`.

### 5.5 `fn_self_join_upgrade_waitlist(p_target_category_id)` → uuid

For the eligible-but-no-bed case. Validates hosteller + eligibility + upgrade-only, then
`INSERT INTO hostel_waitlist (entry_kind='upgrade', status='waiting',
target_hostel_category_id, learner_id, academic_year_id, institution_id)`. Idempotent: if a
`waiting` upgrade entry already exists for this target, return it (refresh `updated_at`). Makes
**no** change to category/allocation/bill.

### 5.6 `_cl_apply_category_bill_change(p_learner, p_hostel_year, p_old_item_category, p_new_item_category, p_new_amount, p_description)` — internal helper

The single billing-mutation point (used by both room and mess upgrades). Per the changed
component only:

1. Locate the active old-category bill:
   `SELECT ... FROM billing_student_bills WHERE student_id=p_learner AND hostel_year_id=p_hostel_year
    AND item_category_id=p_old_item_category AND fee_source='hostel_category' AND status<>'cancelled'`.
2. `v_paid := COALESCE(final_amount - balance_amount, 0)` on that bill (amount already received).
3. **No payments (`v_paid = 0`) — the normal case:**
   - `UPDATE ... SET status='cancelled'` on the old bill.
   - `INSERT` new bill: `item_category_id=p_new_item_category`, `fee_source='hostel_category'`,
     `bill_description=p_description`, `quantity=1`, `unit_amount=total_amount=final_amount=
     balance_amount=p_new_amount`, `status='unpaid'`, `due_date=now()+30d`,
     `institution_id`/`hostel_year_id` from the learner/year. `bill_action='replaced'`.
4. **Old bill has payments (`v_paid > 0`) — edge case:**
   - Keep the old bill (preserve receipts); `INSERT` the new bill for the **net owed**:
     `final_amount = p_new_amount`, `balance_amount = max(0, p_new_amount - v_paid)`. Credits
     the already-paid amount so the resident owes only the difference. `bill_action='differential'`.
   - ⚠️ **Implementation note:** verify interaction with
     `trigger_update_bill_balance_on_amount_change` (it recomputes balance on `bill_amount`
     change) — set amounts so the trigger doesn't clobber the credited balance; adjust the
     insert columns to match the table's actual generated/trigger columns during planning.
5. If no old bill exists at all (resident was never billed for the old category): just `INSERT`
   the new full bill. `bill_action='created'`.
6. Returns `bill_action` + amounts for the RPC response / toast.

> All inserts copy the column shape used by `campus_living_generate_hostel_year_bills` so the
> new rows are indistinguishable from generated bills downstream (Billing Schedule, receipts,
> analytics).

---

## 6. Service Layer

`lib/services/campus-living/category-upgrade-service.ts` (client service, mirrors
`SelfAllocationService` loose-RPC pattern):

```ts
class CategoryUpgradeService {
  getUpgradeRoomCategories(): Promise<UpgradeRoomCategoryOption[]>   // fn_my_upgrade_room_categories
  getUpgradeMessCategories(): Promise<UpgradeMessCategoryOption[]>   // fn_my_upgrade_mess_categories
  getRoomOptions(categoryId): Promise<RoomOption[]>                  // reuse fn_my_room_options
  upgradeRoomCategory(categoryId, roomId, bedId): Promise<RoomUpgradeResult>
  upgradeMessCategory(messCategoryId): Promise<MessUpgradeResult>
  joinUpgradeWaitlist(categoryId): Promise<string>
}
```

Types in `types/campus-living/category-upgrade.ts`.

## 7. Hooks

`hooks/campus-living/use-category-upgrade.ts`:
- `useUpgradeRoomCategories()`, `useUpgradeMessCategories()`, `useUpgradeRoomOptions(categoryId)`.
- `useUpgradeRoomCategory()`, `useUpgradeMessCategory()`, `useJoinUpgradeWaitlist()` mutations.
- On success, invalidate: My Hostel summary (`use-my-hostel`), allocations
  (`['hostel-allocations','by-learner', profileId]`), category fees, billing keys, and
  `hostelWaitlistKeys.all`.

## 8. UI

Add an **"Upgrade Category"** area to the existing **"My Category & Fees"** tab
(`my-hostel/_components/category-fees-tab.tsx`) — keeps category + fees + upgrade in one place;
no new tab. Two cards:

- **Room Category** — current category + fee; a list of upgrade options (`fee ≥ current`). Each
  row shows the new fee and a CTA driven by the RPC flags:
  - `available_beds > 0` → **"Upgrade now"** → bed-picker dialog (reuse `request-room`'s grouped
    bed UI) → confirm dialog showing **₹current → ₹new** and "a new bill will be generated" →
    `upgradeRoomCategory`. Success toast: "Upgraded to {name} · new bill ₹{amount} generated."
  - eligible & `available_beds = 0` → **"Join waitlist"** → `joinUpgradeWaitlist`; show
    "On waitlist (your Classic stay & bill are unchanged)."
  - not eligible → disabled with reason.
- **Mess Category** — current + fee; upgrade options; **"Upgrade"** → confirm (₹current → ₹new)
  → `upgradeMessCategory`. No bed step.
- A small **"You're on the waitlist for {category}"** status line when a `waiting` upgrade entry
  exists; if a bed has since opened, surface the **"Upgrade now"** CTA (D1 self-complete).

No Fee Config UI change.

---

## 9. Eligibility, Availability & Upgrade-Only — precise rules

- **Eligibility (program rule):** `fn_learner_eligible_for_room(learner, room)` — the
  Physical-Rooms rules from the Program Eligibility module. A category `is_eligible` if ≥1 of
  its rooms passes (ignoring bed availability), AND gender/institution match.
- **Availability:** ≥1 eligible bed `status='available'` and not held by an
  active/pending allocation (reuse `fn_my_room_options`).
- **Upgrade-only:** `fee(target) >= fee(current)` for the current hostel year. Equal-fee
  lateral moves are allowed (≥); strictly-cheaper downgrades are blocked.

---

## 10. Edge Cases

| Case | Handling |
|------|----------|
| New category has no `hostel_fees` row (unbilled) | Exclude from upgrade list (`current_year_fee` null) → can't upgrade into an unpriced category. |
| Old category bill already paid (full/partial) | Differential path (§5.6.4) — credit paid amount, bill only the difference; never double-charge. |
| Resident on a **flat package** bill (not category-itemized) | Out of scope v1 — their bill has no per-category line to swap. Surface "contact hostel office"; don't attempt. |
| Concurrent bed claim | Advisory lock + re-check `available` (returns `bed_locked_by_other` / `bed_unavailable`). |
| Double-submit | RPC is atomic + idempotent (old already `vacated`/bed `occupied` → guards fire); UI disables button on pending. |
| Re-join waitlist | Idempotent — returns existing `waiting` entry. |
| No active allocation (shouldn't happen post-auto-alloc) | RPC returns `no_active_allocation`; UI shows "no active allocation to upgrade." |
| Mess upgrade with no current mess category | Allowed (treated as setting it); bill = new full mess fee. |

---

## 11. Out of Scope (v1)

- **Auto-promote on vacancy** (D2) — waitlist offers (`offered_at`/`offer_expires_at`) wired to
  bed-vacate. Future follow-up.
- **Downgrades / refunds / credits** beyond the paid-bill differential safeguard.
- **Flat-package** learners' upgrades.
- Pro-rata mid-year billing (we bill the **full** current-year category amount, consistent with
  how standard hosteller bills are generated).
- Warden/admin upgrade-approval UI (explicitly not wanted).

---

## 12. Permissions / RLS

- Self-service RPCs gated by `user_is_hosteler()` + caller-owns-the-row; `SECURITY DEFINER`
  performs the bed/profile/bill writes on the resident's behalf.
- `hostel_waitlist` already has RLS (learner own-row insert/select + warden/admin scope); the
  two new columns ride existing policies. Verify the resident can `INSERT` their own
  `entry_kind='upgrade'` row (the RPC is definer, so it's covered regardless).
- No new permission key (consistent with `fn_self_request_room`).

---

## 13. Verification Plan

No automated suite in this repo → verify by:
1. **Typecheck** touched files (`hostel_waitlist` types regenerated, new service/hooks/UI).
2. **Migration grounding:** commit real SQL bodies (no `SELECT 1;`), mirror into
   `supabase/setup/*`; `get_advisors` after applying.
3. **Browser, as a non-super-admin hosteller:**
   - Room upgrade with an available Premium bed → bed moves, old bed freed, profile category =
     Premium, **old Classic bill cancelled + new Premium bill at the Fee Config amount** appears
     in Billing Schedule.
   - Room upgrade with **no** available bed → waitlist row created, **category/allocation/bill
     unchanged**; when a bed is freed, "Upgrade now" appears and completes (D1).
   - Mess upgrade → mess category + mess bill swap; room bill untouched (separate lines).
   - Downgrade attempt → blocked.
   - Paid-bill upgrade → differential bill, no double-charge.
4. Confirm `check:*` gates pass if any route/permission/menu changed.

---

## 14. Open Questions

- §5.6.4 trigger interaction (`trigger_update_bill_balance_on_amount_change`) — resolve the
  exact insert columns during planning so the credited balance isn't recomputed away.
- Confirm the live `allocation_status_enum` carries `pending_approval`/`rejected` (used by the
  self-allocation RPCs) — not needed here (we use `active`/`vacated`), but worth noting the
  generated-types array omits them.
```
