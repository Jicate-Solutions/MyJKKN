# Hostel Pending-Category Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a room-category upgrade show the new category immediately on confirm (as a *pending* state) while the room move + payment stay deferred, and auto-revert the pending state if the hold deadline passes unpaid.

**Architecture:** Approach B — add `learners_profiles.pending_hostel_category_id`. The confirm RPCs stage the target into `pending`; the payment-confirmation engine promotes it into `hostel_category_id` and clears pending; the expiry cron clears pending (no destructive flip). Spec: `docs/superpowers/specs/2026-06-15-hostel-pending-category-upgrade-design.md`.

**Tech Stack:** Supabase Postgres (PL/pgSQL `SECURITY DEFINER` RPCs), Next.js 16 / React 19 front-end, TanStack Query. Verification is SQL simulation + `mcp__ide__getDiagnostics` + browser (no test runner exists).

**Base definitions:** the current live bodies of `fn_self_upgrade_room_category`, `fn_self_upgrade_category_only`, `_cl_execute_room_upgrade`, `fn_cl_process_upgrade_holds`, `fn_cl_expire_upgrade_holds` were captured during design and are the base each before→after snippet edits. Re-fetch any with `pg_get_functiondef` if unsure before editing.

---

## Task 1: Schema column + type registration

**Files:**
- Create: `supabase/migrations/20260616010000_learners_pending_hostel_category.sql`
- Modify: `supabase/setup/01_tables.sql` (mirror the column)
- Modify: `types/supabase.ts` (learners_profiles Row/Insert/Update)

- [ ] **Step 1: Write the migration**

```sql
-- Staged (pending) hostel category for in-flight upgrades. Set when a learner confirms
-- an upgrade; promoted into hostel_category_id on payment+threshold; cleared on expiry.
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS pending_hostel_category_id uuid
    REFERENCES public.hostel_categories(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Apply it** — via `mcp__supabase__apply_migration` (name `learners_pending_hostel_category`) with the same body. Then mirror the same `ALTER TABLE … ADD COLUMN IF NOT EXISTS` into `supabase/setup/01_tables.sql` near the other `learners_profiles` alters.

- [ ] **Step 3: Register the column** in `types/supabase.ts` → `learners_profiles` (alphabetical position): add `pending_hostel_category_id: string | null` to `Row`, and `pending_hostel_category_id?: string | null` to `Insert` and `Update`.

- [ ] **Step 4: Verify**

Run (SQL): `select column_name from information_schema.columns where table_name='learners_profiles' and column_name='pending_hostel_category_id';`
Expected: one row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260616010000_learners_pending_hostel_category.sql supabase/setup/01_tables.sql types/supabase.ts
git commit -m "feat(campus-living): add learners_profiles.pending_hostel_category_id"
```

---

## Task 2: Stage `pending` on confirm + add deadline to category-only

**Files:**
- Create: `supabase/migrations/20260616020000_hostel_upgrade_pending_category_lifecycle.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror all functions changed in Tasks 2–4)

This migration contains the full `CREATE OR REPLACE` for all five functions below (Tasks 2–4 describe the edits; they ship as ONE migration since they share the pending lifecycle). Assemble each full body from its live definition with the edits applied.

- [ ] **Step 1: `fn_self_upgrade_room_category` — stage pending in the reserve paths.**

In BOTH terminal `RETURN jsonb_build_object('success', true, 'state', 'pending_payment', …)` and `'state', 'waitlisted'` branches, immediately BEFORE the `RETURN`, insert:

```sql
  UPDATE learners_profiles SET pending_hostel_category_id = p_new_category_id, updated_at=now() WHERE id = v_lp;
```

(The two immediate-confirm branches — `_cl_execute_first_booking` and `_cl_execute_room_upgrade` — are left unchanged; `_cl_execute_room_upgrade` clears pending in Task 3.)

- [ ] **Step 2: `fn_self_upgrade_category_only` — stage pending, add a hold deadline, clear on the fee≤0 shortcut.**

a) In the fee≤0 immediate branch, change the update to also clear pending:

```sql
-- before
UPDATE learners_profiles SET hostel_category_id = p_new_category_id, updated_at=now() WHERE id = v_lp;
-- after
UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = v_lp;
```

b) The waitlist INSERT currently passes `hold_expires_at = NULL`. Change it to a real deadline:

```sql
-- before  (…, held_room_id, held_bed_id, hold_expires_at, upgrade_bill_id) VALUES (…, NULL, NULL, NULL, v_bill_id)
-- after   set hold_expires_at = now() + make_interval(days => COALESCE(v_hold_days, 5))
INSERT INTO hostel_waitlist (institution_id, learner_id, academic_year_id, status, entry_kind,
  target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at, upgrade_bill_id)
VALUES (v_inst, v_profile, v_ay, 'waiting', 'upgrade',
  p_new_category_id, NULL, NULL, now() + make_interval(days => COALESCE(v_hold_days, 5)), v_bill_id)
RETURNING id INTO v_wl;
```

c) In the `v_wl IS NOT NULL` UPDATE branch, also set the deadline:

```sql
-- after
UPDATE hostel_waitlist SET upgrade_bill_id=v_bill_id,
  hold_expires_at = now() + make_interval(days => COALESCE(v_hold_days, 5)), updated_at=now() WHERE id=v_wl;
```

d) Immediately before EACH `RETURN jsonb_build_object('success', true, 'state', 'pending_payment', …)` (there are two — the early "bill already exists" return and the final one), insert:

```sql
  UPDATE learners_profiles SET pending_hostel_category_id = p_new_category_id, updated_at=now() WHERE id = v_lp;
```

- [ ] **Step 3: Apply the migration** (`mcp__supabase__apply_migration`, name `hostel_upgrade_pending_category_lifecycle`) — but only after Tasks 3 & 4 edits are folded into the SAME migration body. (Sequence the writing: edit all five functions, then apply once.)

- [ ] **Step 4: Verify staging (after apply).** Simulate a confirm for a test resident, then check:

Run (SQL): `select hostel_category_id, pending_hostel_category_id from learners_profiles where id = '<test_lp>';`
Expected: `hostel_category_id` unchanged; `pending_hostel_category_id` = the target.
Also: `select status, hold_expires_at from hostel_waitlist where learner_id = '<profiles.id>' and entry_kind='upgrade' order by created_at desc limit 1;` → `waiting`, `hold_expires_at` in the future.

---

## Task 3: Clear `pending` on real confirmation

**Files:**
- Modify (same migration as Task 2): `_cl_execute_room_upgrade`, `fn_cl_process_upgrade_holds`

- [ ] **Step 1: `_cl_execute_room_upgrade` — clear pending when promoting the category.**

```sql
-- before
UPDATE learners_profiles SET hostel_category_id = p_new_category_id, updated_at=now() WHERE id = p_lp;
-- after
UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;
```

- [ ] **Step 2: `fn_cl_process_upgrade_holds` — clear pending in the category-only loop (B).**

```sql
-- before
UPDATE learners_profiles SET hostel_category_id = v_row.target_hostel_category_id, updated_at=now() WHERE id = p_student_lp;
-- after
UPDATE learners_profiles SET hostel_category_id = v_row.target_hostel_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_student_lp;
```

- [ ] **Step 3: Verify confirmation.** With a staged upgrade (Task 2), record a full payment for the upgrade bill (or simulate the trigger), then:

Run (SQL): `select hostel_category_id, pending_hostel_category_id from learners_profiles where id = '<test_lp>';`
Expected: `hostel_category_id` = target; `pending_hostel_category_id` = NULL. Waitlist row → `allocated`.

---

## Task 4: Revert (clear pending) on expiry; cover category-only rows

**Files:**
- Modify (same migration as Task 2): `fn_cl_expire_upgrade_holds`

- [ ] **Step 1: Replace the body** so it (a) expires any upgrade row past `hold_expires_at` — not only those with a held bed — and (b) clears `pending` for the affected learner when it matches the expiring target:

```sql
CREATE OR REPLACE FUNCTION public.fn_cl_expire_upgrade_holds()
 RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  WITH expired AS (
    UPDATE hostel_waitlist
       SET status='expired', updated_at=now()
     WHERE entry_kind='upgrade' AND status='waiting'
       AND hold_expires_at IS NOT NULL AND hold_expires_at < now()
     RETURNING learner_id, target_hostel_category_id, held_bed_id, upgrade_bill_id
  ), released AS (
    UPDATE hostel_beds b SET status='available'
    FROM expired e WHERE b.id = e.held_bed_id AND b.status='reserved'
    RETURNING b.id
  ), bills_cancelled AS (
    UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM expired e
    WHERE bb.id = e.upgrade_bill_id AND bb.status='unpaid'
      AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id)
    RETURNING bb.id
  ), pending_cleared AS (
    UPDATE learners_profiles lp SET pending_hostel_category_id = NULL, updated_at=now()
    FROM expired e JOIN profiles pr ON pr.id = e.learner_id
    WHERE lp.id = pr.learner_id AND lp.pending_hostel_category_id = e.target_hostel_category_id
    RETURNING lp.id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN COALESCE(v_count, 0);
END $function$;
```

- [ ] **Step 2: Apply the combined migration** (Tasks 2–4 functions) via `mcp__supabase__apply_migration`. Mirror ALL five `CREATE OR REPLACE` bodies into `supabase/setup/02_functions.sql` (replace the stale copies).

- [ ] **Step 3: Verify revert.** Stage an upgrade, then force-expire it:

Run (SQL): `update hostel_waitlist set hold_expires_at = now() - interval '1 min' where learner_id='<profiles.id>' and entry_kind='upgrade' and status='waiting'; select fn_cl_expire_upgrade_holds();`
Then: `select hostel_category_id, pending_hostel_category_id from learners_profiles where id='<test_lp>';`
Expected: `hostel_category_id` unchanged; `pending_hostel_category_id` = NULL. Waitlist → `expired`; held bed (if any) → `available`; unpaid bill → `cancelled`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260616020000_hostel_upgrade_pending_category_lifecycle.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): stage/promote/revert pending hostel category across upgrade lifecycle"
```

---

## Task 5: Front-end — surface pending; lock options while pending

**Files:**
- Modify: `app/(routes)/campus-living/my-hostel/_components/room-category-upgrade-card.tsx`
- Modify: the My Hostel hub component that renders the resident's current category (locate via the page that consumes the learner profile / category name)
- Modify: the learner-profile TS type used by My Hostel (add `pending_hostel_category_id: string | null`), and the service/RPC select that feeds it (ensure the column is returned)

- [ ] **Step 1: Ensure the pending category id + name reach the client.** In the My Hostel data source (service/hook that loads the resident's profile/category), include `pending_hostel_category_id` and resolve its category name. Add the field to the corresponding TS interface.

- [ ] **Step 2: Hub display.** Where the current category is shown, when `pending_hostel_category_id` is set render a pending badge, e.g. `"{currentCategoryName} → {pendingCategoryName} · pending payment"`.

- [ ] **Step 3: Lock other options while pending** in `room-category-upgrade-card.tsx`. Compute `const hasPending = myWaitlist.some(w => /* status waiting */)` (it already derives `pendingTarget`). For every option that is NOT the pending target, render it disabled with a short note ("Finish or cancel your pending upgrade first"), reusing the existing `locked` styling path.

- [ ] **Step 4: Verify types** — run `mcp__ide__getDiagnostics` on each modified `.tsx`/`.ts`. Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/(routes)/campus-living/my-hostel/_components/room-category-upgrade-card.tsx <hub file> <types/service files>
git commit -m "feat(campus-living): show pending hostel-category upgrade state in My Hostel"
```

---

## Task 6: End-to-end verification

- [ ] **Step 1: Pick a test resident per kind** — one whose target is auto/category-only (→Deluxe) and one room-pick (→Premium / Premium+AC). Record their `learners_profiles.id` and `profiles.id`.

- [ ] **Step 2: Walk the three outcomes** for each (using the SQL checks from Tasks 2–4): confirm → staged; pay+threshold → promoted+cleared; force-expire → reverted.

- [ ] **Step 3: Browser smoke (non-super-admin resident).** In My Hostel: confirm an upgrade → category shows pending immediately; other options locked; after (simulated) payment the category shows confirmed; after a forced expiry the pending badge clears. Confirm reserved beds never appear bookable to other residents during the hold.

- [ ] **Step 4: Gate checks** (routes/keys unchanged, but run for safety): none required unless a route/permission changed (it did not).
