# Campus Living — Self-Service Category Upgrade + Auto Re-Billing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a hostel resident self-upgrade their room and/or mess category from My Hostel; on success move the bed (room only), flip the profile category FK, and auto re-issue the bill from Fee Config category amounts — or, if no bed is free, join the waitlist with the current category untouched.

**Architecture:** New `SECURITY DEFINER` RPCs reuse the *existing* self-allocation helpers (`fn_my_manual_categories`, `fn_my_room_options`, `fn_hostel_learner_mess_categories`) so they inherit the current gender / institution / fee-aware eligibility gates. A single billing helper `_cl_apply_category_bill_change` cancels the old category bill and inserts the new one (or a differential if already paid). A thin client service + React Query hooks drive three new UI pieces inside the existing **My Category & Fees** tab.

**Tech Stack:** Postgres (Supabase, plpgsql, RLS), Next.js 16 / React 19, TanStack Query v5, TypeScript, Shadcn UI.

**Spec:** `docs/superpowers/specs/2026-06-09-campus-living-category-upgrade-billing-design.md`

---

## ⚠️ Load-bearing facts (read before coding)

- **Dual keying.** `hostel_allocations.learner_id` and `hostel_waitlist.learner_id` are **`profiles.id`** (= `auth.uid()`). `billing_student_bills.student_id` and `learners_profiles.id` are **`get_my_learner_id()`** (learners_profiles.id). Every RPC keeps `v_profile := auth.uid()` and `v_lp := get_my_learner_id()` and uses the right one per table. Mixing them silently writes to the wrong rows.
- **Reuse, don't re-transcribe.** `room_institution_access` was dropped (2026-06-03). Do NOT copy the 2026-05-31 RPC bodies. The new RPCs call `fn_my_manual_categories()` / `fn_my_room_options()` which already carry the latest gates.
- **`auth.uid()` survives nested SECURITY DEFINER calls** (it reads the JWT claim, not the role), so calling `fn_my_room_options()` from inside our DEFINER RPCs still resolves the real resident.
- **Bill rows shape** must match `campus_living_generate_hostel_year_bills` exactly so downstream (Billing Schedule, receipts, analytics) treats them identically.
- **No test runner in this repo.** "Verify" = Supabase MCP `execute_sql` / `get_advisors` for SQL, `mcp__ide__getDiagnostics` per touched file for TS, and a browser smoke test. Never claim a suite passed.
- **Migrations:** apply via Supabase MCP `apply_migration`, **commit the real SQL body** to `supabase/migrations/`, and mirror functions into `supabase/setup/02_functions.sql` (and the table change into `01_tables.sql`). No `SELECT 1;` placeholders.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260609160000_hostel_waitlist_upgrade_columns.sql` | Extend `hostel_waitlist` (target category + entry_kind + partial unique index) |
| `supabase/migrations/20260609161000_cl_category_bill_change_helper.sql` | `_cl_apply_category_bill_change` billing helper |
| `supabase/migrations/20260609162000_cl_upgrade_list_rpcs.sql` | `fn_my_upgrade_room_categories`, `fn_my_upgrade_mess_categories` |
| `supabase/migrations/20260609163000_cl_upgrade_action_rpcs.sql` | `fn_self_upgrade_room_category`, `fn_self_upgrade_mess_category`, `fn_self_join_upgrade_waitlist` |
| `supabase/setup/01_tables.sql`, `02_functions.sql` | Mirror the above (reference source of truth) |
| `types/supabase.ts` | Register the two new `hostel_waitlist` columns (Row/Insert/Update) |
| `types/campus-living/category-upgrade.ts` | Option + result types |
| `lib/services/campus-living/category-upgrade-service.ts` | Thin RPC wrappers |
| `hooks/campus-living/use-category-upgrade.ts` | React Query reads + mutations + cache invalidation |
| `app/(routes)/campus-living/my-hostel/_components/room-upgrade-bed-dialog.tsx` | Bed picker for a chosen room category |
| `app/(routes)/campus-living/my-hostel/_components/room-category-upgrade-card.tsx` | Room upgrade card (options → upgrade now / waitlist) |
| `app/(routes)/campus-living/my-hostel/_components/mess-category-upgrade-card.tsx` | Mess upgrade card |
| `app/(routes)/campus-living/my-hostel/_components/category-fees-tab.tsx` | Wire the two cards + waitlist status (MODIFY) |

---

## Task 1: Extend `hostel_waitlist`

**Files:**
- Create: `supabase/migrations/20260609160000_hostel_waitlist_upgrade_columns.sql`
- Modify: `supabase/setup/01_tables.sql` (mirror), `types/supabase.ts` (register columns)

- [ ] **Step 1: Write the migration**

```sql
-- 20260609160000_hostel_waitlist_upgrade_columns.sql
-- Reuse hostel_waitlist for self-service category-upgrade intent.
ALTER TABLE public.hostel_waitlist
  ADD COLUMN IF NOT EXISTS target_hostel_category_id uuid REFERENCES public.hostel_categories(id),
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'allocation';

COMMENT ON COLUMN public.hostel_waitlist.target_hostel_category_id IS
  'entry_kind=upgrade: room category the resident wants to move up to.';
COMMENT ON COLUMN public.hostel_waitlist.entry_kind IS
  'allocation = first-allocation preference (legacy); upgrade = self-service category upgrade intent.';

-- At most one active upgrade intent per (resident, target category).
CREATE UNIQUE INDEX IF NOT EXISTS uq_hostel_waitlist_active_upgrade
  ON public.hostel_waitlist (learner_id, target_hostel_category_id)
  WHERE entry_kind = 'upgrade' AND status = 'waiting';
```

- [ ] **Step 2: Apply via Supabase MCP** — `apply_migration` with name `hostel_waitlist_upgrade_columns` and the body above.

- [ ] **Step 3: Verify the columns + index exist**

Run (Supabase MCP `execute_sql`):
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name='hostel_waitlist' AND column_name IN ('target_hostel_category_id','entry_kind');
SELECT indexname FROM pg_indexes WHERE indexname='uq_hostel_waitlist_active_upgrade';
```
Expected: two column rows (`target_hostel_category_id` uuid, `entry_kind` text default `'allocation'`) and one index row.

- [ ] **Step 4: Mirror into `supabase/setup/01_tables.sql`** — find the `CREATE TABLE ... hostel_waitlist` block and add the two columns + a `CREATE UNIQUE INDEX ... uq_hostel_waitlist_active_upgrade` line beneath it.

- [ ] **Step 5: Register columns in `types/supabase.ts`** — locate the `hostel_waitlist:` table block and add to each of Row / Insert / Update:

```ts
// Row:
          target_hostel_category_id: string | null
          entry_kind: string
// Insert:
          target_hostel_category_id?: string | null
          entry_kind?: string
// Update:
          target_hostel_category_id?: string | null
          entry_kind?: string
```

- [ ] **Step 6: Typecheck** `types/supabase.ts` via `mcp__ide__getDiagnostics`. Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260609160000_hostel_waitlist_upgrade_columns.sql supabase/setup/01_tables.sql types/supabase.ts
git commit -m "feat(campus-living): add upgrade intent columns to hostel_waitlist

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Billing helper `_cl_apply_category_bill_change`

**Files:**
- Create: `supabase/migrations/20260609161000_cl_category_bill_change_helper.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror)

The single billing-mutation point. Cancels the old category's active bill and inserts the new one at full amount; if the old bill already received payment, keeps it and bills only the difference (never double-charges).

- [ ] **Step 1: Write the migration**

```sql
-- 20260609161000_cl_category_bill_change_helper.sql
-- Re-bill ONE hostel category component (room OR mess) for a learner in a hostel
-- year. student_id = learners_profiles.id. Mirrors the row shape inserted by
-- campus_living_generate_hostel_year_bills so downstream treats it identically.
CREATE OR REPLACE FUNCTION public._cl_apply_category_bill_change(
  p_learner_lp     uuid,   -- learners_profiles.id
  p_hostel_year_id uuid,
  p_old_item_cat   uuid,   -- old room/mess category id (nullable: never billed)
  p_new_item_cat   uuid,   -- new room/mess category id
  p_new_amount     numeric,
  p_description    text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inst       uuid;
  v_old_id     uuid;
  v_old_final  numeric;
  v_old_bal    numeric;
  v_paid       numeric := 0;
  v_bill_total numeric;
  v_desc       text := p_description;
  v_action     text;
BEGIN
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_lp;

  IF p_old_item_cat IS NOT NULL THEN
    SELECT id, final_amount, balance_amount
      INTO v_old_id, v_old_final, v_old_bal
      FROM billing_student_bills
     WHERE student_id = p_learner_lp
       AND hostel_year_id = p_hostel_year_id
       AND item_category_id = p_old_item_cat
       AND fee_source = 'hostel_category'
       AND status <> 'cancelled'
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  IF v_old_id IS NOT NULL THEN
    v_paid := GREATEST(0, COALESCE(v_old_final,0) - COALESCE(v_old_bal,0));
  END IF;

  IF v_old_id IS NULL THEN
    v_bill_total := p_new_amount;                       -- never billed for old category
    v_action := 'created';
  ELSIF v_paid = 0 THEN
    UPDATE billing_student_bills SET status='cancelled', updated_at=now() WHERE id = v_old_id;
    v_bill_total := p_new_amount;                       -- replace at full new amount
    v_action := 'replaced';
  ELSE
    v_bill_total := GREATEST(0, p_new_amount - v_paid); -- keep paid bill; bill only the difference
    v_desc := p_description || ' (upgrade differential)';
    v_action := 'differential';
  END IF;

  IF v_bill_total > 0 THEN
    INSERT INTO billing_student_bills (
      student_id, institution_id, item_category_id, hostel_year_id, fee_source,
      bill_description, due_date, quantity, unit_amount, total_amount, final_amount,
      balance_amount, status
    ) VALUES (
      p_learner_lp, v_inst, p_new_item_cat, p_hostel_year_id, 'hostel_category',
      v_desc, now() + interval '30 day', 1, v_bill_total, v_bill_total, v_bill_total,
      v_bill_total, 'unpaid'
    ) ON CONFLICT DO NOTHING;  -- partial unique index guards a duplicate new-category bill
  END IF;

  RETURN jsonb_build_object('action', v_action, 'new_amount', p_new_amount,
                            'billed', v_bill_total, 'old_bill_id', v_old_id);
END $$;

REVOKE ALL ON FUNCTION public._cl_apply_category_bill_change(uuid,uuid,uuid,uuid,numeric,text) FROM anon, PUBLIC;
-- Internal helper: only the upgrade RPCs (owned by the same role) call it; no direct grant.
```

> **Note (refines spec §5.6.4):** the differential path bills the *difference as the new row's total* (not full-amount-with-credited-balance). This keeps "total billed" accurate (old paid + diff = new) and, because we only INSERT (never UPDATE `bill_amount`), it sidesteps `trigger_update_bill_balance_on_amount_change`.

- [ ] **Step 2: Apply via Supabase MCP** (`apply_migration`, name `cl_category_bill_change_helper`).

- [ ] **Step 3: Verify the function exists**

```sql
SELECT proname FROM pg_proc WHERE proname='_cl_apply_category_bill_change';
```
Expected: one row.

- [ ] **Step 4: Mirror into `supabase/setup/02_functions.sql`** (append the function + the REVOKE).

- [ ] **Step 5: `get_advisors` (type=security)** — confirm no new "function with role mutable search_path" / exposed-function warnings for this helper (it sets `search_path` and revokes anon).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260609161000_cl_category_bill_change_helper.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): category re-bill helper (cancel old + new/differential)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Upgrade-list RPCs

**Files:**
- Create: `supabase/migrations/20260609162000_cl_upgrade_list_rpcs.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror)

- [ ] **Step 1: Write the migration**

```sql
-- 20260609162000_cl_upgrade_list_rpcs.sql
-- Self-service upgrade option lists. Both reuse the latest eligibility helpers.

-- ROOM: eligible manual categories (fn_my_manual_categories already applies gender
-- + fee-aware program eligibility), priced for the current hostel year, fee >= the
-- learner's current category fee, with a live eligible+available bed count.
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_categories()
RETURNS TABLE (category_id uuid, name text, type text, current_year_fee numeric, available_beds int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND is_active LIMIT 1;

  RETURN QUERY
  SELECT mc.id, mc.name, mc.type, hf.amount,
         (SELECT count(*)::int FROM fn_my_room_options(mc.id))
  FROM fn_my_manual_categories() mc
  JOIN hostel_fees hf
    ON hf.hostel_category_id = mc.id AND hf.hostel_year_id = v_year AND hf.is_active
  WHERE mc.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount >= v_cur_fee
  ORDER BY hf.amount;
END $$;

-- MESS: active mess categories in the fee-aware mess allow-set (fail-open if no
-- rule/bill data), priced for the current hostel year, fee >= current mess fee.
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_mess_categories()
RETURNS TABLE (mess_category_id uuid, name text, current_year_fee numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_allow uuid[];
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT mess_category_id INTO v_cur_mess FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE mess_category_id = v_cur_mess AND hostel_year_id = v_year AND is_active LIMIT 1;
  SELECT array_agg(category_id) INTO v_allow FROM fn_hostel_learner_mess_categories(v_lp);

  RETURN QUERY
  SELECT m.id, m.name, hf.amount
  FROM mess_categories m
  JOIN hostel_fees hf
    ON hf.mess_category_id = m.id AND hf.hostel_year_id = v_year AND hf.is_active
  WHERE m.is_active
    AND (v_allow IS NULL OR m.id = ANY(v_allow))
    AND m.id <> COALESCE(v_cur_mess, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount >= v_cur_fee
  ORDER BY hf.amount;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_mess_categories() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_mess_categories() TO authenticated;
```

- [ ] **Step 2: Pre-flight schema check** (the RPCs reference `mess_categories.is_active`/`name`, `hostel_categories.name`):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='mess_categories' AND column_name IN ('is_active','name');
```
Expected: both rows present. (If `mess_categories` lacks `is_active`, drop that predicate before applying.)

- [ ] **Step 3: Apply via Supabase MCP** (`apply_migration`, name `cl_upgrade_list_rpcs`).

- [ ] **Step 4: Verify functions exist + signatures**

```sql
SELECT proname, pg_get_function_result(oid)
FROM pg_proc WHERE proname IN ('fn_my_upgrade_room_categories','fn_my_upgrade_mess_categories');
```
Expected: two rows with the TABLE result types above.

- [ ] **Step 5: Mirror into `supabase/setup/02_functions.sql`.**

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260609162000_cl_upgrade_list_rpcs.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): self-service upgrade option list RPCs (room + mess)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Upgrade-action RPCs

**Files:**
- Create: `supabase/migrations/20260609163000_cl_upgrade_action_rpcs.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror)

- [ ] **Step 1: Write the migration**

```sql
-- 20260609163000_cl_upgrade_action_rpcs.sql
-- Instant self-service category upgrades (no approval). Dual keying:
--   v_profile = auth.uid()        -> hostel_allocations / hostel_waitlist.learner_id
--   v_lp      = get_my_learner_id -> learners_profiles.id / billing student_id

-- ROOM: atomic bed move (mirror fn_premium_upgrade_accept) + profile + re-bill.
CREATE OR REPLACE FUNCTION public.fn_self_upgrade_room_category(
  p_new_category_id uuid, p_room_id uuid, p_bed_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_bed_status text; v_old RECORD; v_new_alloc uuid; v_bill jsonb;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can upgrade';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  -- chosen room/bed must be one of the caller's current eligible+available options
  IF NOT EXISTS (
    SELECT 1 FROM fn_my_room_options(p_new_category_id) o
    WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for you';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

  SELECT id, bed_id, tier_id, academic_year_id, semester_id, institution_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old
    FROM hostel_allocations
    WHERE learner_id = v_profile AND status = 'active'
    ORDER BY allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'You have no active allocation to upgrade from'; END IF;

  -- close old + free old bed
  UPDATE hostel_allocations SET status='vacated', actual_vacate_date=CURRENT_DATE, updated_at=now()
    WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  -- new active allocation on the chosen bed (a MOVE; carry context)
  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by
  )
  SELECT v_old.institution_id, v_profile, r.block_id, p_room_id, p_bed_id,
         v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
         v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
         v_old.tier_id, v_profile
  FROM hostel_rooms r WHERE r.id = p_room_id
  RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile WHERE id = p_bed_id;

  -- profile category + re-bill (room component)
  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, updated_at=now() WHERE id = v_lp;
  v_bill := public._cl_apply_category_bill_change(v_lp, v_year, v_cur_cat, p_new_category_id, v_new_fee, v_new_name);

  -- fulfil any waiting upgrade intent for this category
  UPDATE hostel_waitlist
     SET status='allocated', allocated_allocation_id=v_new_alloc, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting';

  RETURN jsonb_build_object('success', true, 'old_allocation_id', v_old.id,
    'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'bill', v_bill);
END $$;

-- MESS: profile + re-bill, no room move.
CREATE OR REPLACE FUNCTION public.fn_self_upgrade_mess_category(p_new_mess_category_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_allow uuid[]; v_bill jsonb;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RAISE EXCEPTION 'Only a hostel resident can upgrade'; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE mess_category_id = p_new_mess_category_id AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected mess category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM mess_categories WHERE id = p_new_mess_category_id;

  SELECT array_agg(category_id) INTO v_allow FROM fn_hostel_learner_mess_categories(v_lp);
  IF v_allow IS NOT NULL AND NOT (p_new_mess_category_id = ANY(v_allow)) THEN
    RAISE EXCEPTION 'You are not eligible for this mess category';
  END IF;

  SELECT mess_category_id INTO v_cur_mess FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE mess_category_id = v_cur_mess AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  UPDATE learners_profiles SET mess_category_id = p_new_mess_category_id, updated_at=now() WHERE id = v_lp;
  v_bill := public._cl_apply_category_bill_change(v_lp, v_year, v_cur_mess, p_new_mess_category_id, v_new_fee, v_new_name);

  RETURN jsonb_build_object('success', true, 'old_category_id', v_cur_mess,
    'new_category_id', p_new_mess_category_id, 'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'bill', v_bill);
END $$;

-- WAITLIST: eligible-but-no-bed. No category/allocation/bill change.
CREATE OR REPLACE FUNCTION public.fn_self_join_upgrade_waitlist(p_target_category_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_inst uuid; v_ay uuid; v_existing uuid; v_id uuid;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can join the waitlist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fn_my_manual_categories() mc WHERE mc.id = p_target_category_id) THEN
    RAISE EXCEPTION 'You are not eligible for this category';
  END IF;

  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = v_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  SELECT id INTO v_existing FROM hostel_waitlist
    WHERE learner_id=v_profile AND entry_kind='upgrade'
      AND target_hostel_category_id=p_target_category_id AND status='waiting' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE hostel_waitlist SET updated_at=now() WHERE id=v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO hostel_waitlist (institution_id, learner_id, academic_year_id, status, entry_kind, target_hostel_category_id)
  VALUES (v_inst, v_profile, v_ay, 'waiting', 'upgrade', p_target_category_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid,uuid,uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_mess_category(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_self_join_upgrade_waitlist(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_mess_category(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_self_join_upgrade_waitlist(uuid) TO authenticated;
```

- [ ] **Step 2: Pre-flight check** the `hostel_allocations` insert columns + the `hostel_beds.current_occupant_id`/`status` columns exist (they are used by `fn_self_request_room`/`fn_approve_allocation`, so they do — confirm only if the apply errors):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='hostel_allocations'
  AND column_name IN ('block_id','room_id','bed_id','semester_id','tier_id','allocated_by','actual_vacate_date','allocation_type');
```
Expected: all eight rows.

- [ ] **Step 3: Apply via Supabase MCP** (`apply_migration`, name `cl_upgrade_action_rpcs`).

- [ ] **Step 4: Verify** the three functions exist + grants are `authenticated`-only:

```sql
SELECT p.proname, array_agg(acl.privilege_type) FILTER (WHERE acl.grantee::regrole::text='authenticated') AS auth_grants
FROM pg_proc p, aclexplode(p.proacl) acl
WHERE p.proname IN ('fn_self_upgrade_room_category','fn_self_upgrade_mess_category','fn_self_join_upgrade_waitlist')
GROUP BY p.proname;
```
Expected: three rows, each with `{EXECUTE}` for authenticated, and **no** `anon` grant (verify separately that anon is absent).

- [ ] **Step 5: Mirror into `supabase/setup/02_functions.sql`.**

- [ ] **Step 6: `get_advisors` (security)** — confirm no new exposed-function or mutable-search_path warnings.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260609163000_cl_upgrade_action_rpcs.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): instant self-service upgrade action RPCs (room move/mess/waitlist)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Types

**Files:**
- Create: `types/campus-living/category-upgrade.ts`

- [ ] **Step 1: Write the file**

```ts
// Self-service category-upgrade option + result shapes.
// Bed options reuse RoomOption from self-allocation-service (fn_my_room_options).

export interface UpgradeRoomCategoryOption {
  category_id: string;
  name: string;
  type: string;
  current_year_fee: number;
  available_beds: number; // 0 => waitlist branch
}

export interface UpgradeMessCategoryOption {
  mess_category_id: string;
  name: string;
  current_year_fee: number;
}

export interface UpgradeBillResult {
  action: 'created' | 'replaced' | 'differential';
  new_amount: number;
  billed: number;
  old_bill_id: string | null;
}

export interface RoomUpgradeResult {
  success: boolean;
  old_allocation_id: string | null;
  new_allocation_id: string | null;
  new_bed_id: string | null;
  old_category_id: string | null;
  new_category_id: string;
  old_fee: number;
  new_fee: number;
  bill: UpgradeBillResult;
}

export interface MessUpgradeResult {
  success: boolean;
  old_category_id: string | null;
  new_category_id: string;
  old_fee: number;
  new_fee: number;
  bill: UpgradeBillResult;
}
```

- [ ] **Step 2: Typecheck** the file via `mcp__ide__getDiagnostics`. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add types/campus-living/category-upgrade.ts
git commit -m "feat(campus-living): category-upgrade types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Service

**Files:**
- Create: `lib/services/campus-living/category-upgrade-service.ts`

- [ ] **Step 1: Write the file**

```ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  UpgradeRoomCategoryOption,
  UpgradeMessCategoryOption,
  RoomUpgradeResult,
  MessUpgradeResult,
} from '@/types/campus-living/category-upgrade';

// Mirrors SelfAllocationService's loose-RPC pattern (RPCs aren't in the generated
// Database type). Reuse SelfAllocationService.getMyRoomOptions for bed listing.
export class CategoryUpgradeService {
  private static get supabase() {
    return createClientSupabaseClient();
  }
  private static rpc(fn: string, args: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.supabase as any).rpc(fn, args) as Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  }

  static async getRoomCategories(): Promise<UpgradeRoomCategoryOption[]> {
    const { data, error } = await this.rpc('fn_my_upgrade_room_categories', {});
    if (error) throw new Error(error.message || 'Failed to load room upgrade options');
    return (data as UpgradeRoomCategoryOption[]) ?? [];
  }

  static async getMessCategories(): Promise<UpgradeMessCategoryOption[]> {
    const { data, error } = await this.rpc('fn_my_upgrade_mess_categories', {});
    if (error) throw new Error(error.message || 'Failed to load mess upgrade options');
    return (data as UpgradeMessCategoryOption[]) ?? [];
  }

  static async upgradeRoom(categoryId: string, roomId: string, bedId: string): Promise<RoomUpgradeResult> {
    const { data, error } = await this.rpc('fn_self_upgrade_room_category', {
      p_new_category_id: categoryId, p_room_id: roomId, p_bed_id: bedId,
    });
    if (error) throw new Error(error.message || 'Upgrade failed');
    return data as RoomUpgradeResult;
  }

  static async upgradeMess(messCategoryId: string): Promise<MessUpgradeResult> {
    const { data, error } = await this.rpc('fn_self_upgrade_mess_category', {
      p_new_mess_category_id: messCategoryId,
    });
    if (error) throw new Error(error.message || 'Upgrade failed');
    return data as MessUpgradeResult;
  }

  static async joinWaitlist(categoryId: string): Promise<string> {
    const { data, error } = await this.rpc('fn_self_join_upgrade_waitlist', {
      p_target_category_id: categoryId,
    });
    if (error) throw new Error(error.message || 'Failed to join waitlist');
    return data as string;
  }
}
```

- [ ] **Step 2: Typecheck.** Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/services/campus-living/category-upgrade-service.ts
git commit -m "feat(campus-living): category-upgrade service (RPC wrappers)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Hooks

**Files:**
- Create: `hooks/campus-living/use-category-upgrade.ts`

- [ ] **Step 1: Confirm the cache keys to invalidate** — open `hooks/campus-living/use-my-hostel.ts` and note the query key used by `useMyHostelSummary`/`useMyCategoryFees` (e.g. `['my-hostel', ...]`). Use that key prefix below. The allocation key is `['hostel-allocations','by-learner', profileId]` (see `my-hostel/page.tsx`). Waitlist key is `hostelWaitlistKeys.all` from `use-hostel-waitlist.ts`.

- [ ] **Step 2: Write the file**

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { CategoryUpgradeService } from '@/lib/services/campus-living/category-upgrade-service';
import { SelfAllocationService } from '@/lib/services/campus-living/self-allocation-service';
import { hostelWaitlistKeys } from '@/hooks/campus-living/use-hostel-waitlist';

const upgradeKeys = {
  roomCategories: ['campus-living', 'upgrade', 'room-categories'] as const,
  messCategories: ['campus-living', 'upgrade', 'mess-categories'] as const,
  beds: (categoryId: string) => ['campus-living', 'upgrade', 'beds', categoryId] as const,
};

export function useUpgradeRoomCategories() {
  return useQuery({
    queryKey: upgradeKeys.roomCategories,
    queryFn: () => CategoryUpgradeService.getRoomCategories(),
  });
}

export function useUpgradeMessCategories() {
  return useQuery({
    queryKey: upgradeKeys.messCategories,
    queryFn: () => CategoryUpgradeService.getMessCategories(),
  });
}

export function useUpgradeRoomBeds(categoryId: string | null) {
  return useQuery({
    queryKey: upgradeKeys.beds(categoryId ?? ''),
    queryFn: () => SelfAllocationService.getMyRoomOptions(categoryId!),
    enabled: !!categoryId,
  });
}

// Shared post-upgrade cache refresh.
function useUpgradeInvalidator() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['my-hostel'] });          // summary + category fees
    qc.invalidateQueries({ queryKey: ['hostel-allocations'] }); // overview / allocation
    qc.invalidateQueries({ queryKey: hostelWaitlistKeys.all });
    qc.invalidateQueries({ queryKey: upgradeKeys.roomCategories });
    qc.invalidateQueries({ queryKey: upgradeKeys.messCategories });
  };
}

export function useUpgradeRoom() {
  const invalidate = useUpgradeInvalidator();
  return useMutation({
    mutationFn: ({ categoryId, roomId, bedId }: { categoryId: string; roomId: string; bedId: string }) =>
      CategoryUpgradeService.upgradeRoom(categoryId, roomId, bedId),
    onSuccess: (res) => {
      invalidate();
      toast.success(`Upgraded · new bill ₹${res.bill.billed.toLocaleString('en-IN')} generated`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Upgrade failed'),
  });
}

export function useUpgradeMess() {
  const invalidate = useUpgradeInvalidator();
  return useMutation({
    mutationFn: (messCategoryId: string) => CategoryUpgradeService.upgradeMess(messCategoryId),
    onSuccess: (res) => {
      invalidate();
      toast.success(`Mess upgraded · new bill ₹${res.bill.billed.toLocaleString('en-IN')} generated`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Upgrade failed'),
  });
}

export function useJoinUpgradeWaitlist() {
  const invalidate = useUpgradeInvalidator();
  return useMutation({
    mutationFn: (categoryId: string) => CategoryUpgradeService.joinWaitlist(categoryId),
    onSuccess: () => {
      invalidate();
      toast.success('Added to the waitlist — your current stay & bill are unchanged');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to join waitlist'),
  });
}
```

- [ ] **Step 3: Typecheck.** Expected: no errors (confirm `hostelWaitlistKeys` is exported from `use-hostel-waitlist.ts`; it is, per the hook file).

- [ ] **Step 4: Commit**

```bash
git add hooks/campus-living/use-category-upgrade.ts
git commit -m "feat(campus-living): category-upgrade hooks (reads + mutations + invalidation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Room upgrade bed-picker dialog

**Files:**
- Create: `app/(routes)/campus-living/my-hostel/_components/room-upgrade-bed-dialog.tsx`

Reuses the grouped bed UI from `request-room/page.tsx`. Receives a chosen category + its `RoomOption[]`; on confirm calls `useUpgradeRoom`.

- [ ] **Step 1: Write the file**

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BedDouble, Loader2 } from 'lucide-react';
import { useUpgradeRoomBeds, useUpgradeRoom } from '@/hooks/campus-living/use-category-upgrade';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  currentFee: number;
  newFee: number;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function RoomUpgradeBedDialog({
  open, onOpenChange, categoryId, categoryName, currentFee, newFee,
}: Props) {
  const { data: beds = [], isLoading } = useUpgradeRoomBeds(open ? categoryId : null);
  const upgrade = useUpgradeRoom();
  const [bedId, setBedId] = useState('');

  const selected = beds.find((b) => b.bed_id === bedId) ?? null;

  const grouped = useMemo(
    () =>
      beds.reduce<Record<string, typeof beds>>((acc, b) => {
        const key = `${b.block_name} · ${b.floor === 0 ? 'Ground floor' : `Floor ${b.floor}`}`;
        (acc[key] ??= []).push(b);
        return acc;
      }, {}),
    [beds]
  );

  const confirm = async () => {
    if (!selected || upgrade.isPending) return;
    await upgrade.mutateAsync({ categoryId, roomId: selected.room_id, bedId: selected.bed_id });
    onOpenChange(false);
    setBedId('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setBedId(''); }}>
      <DialogContent className="w-[95vw] max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upgrade to {categoryName}</DialogTitle>
          <DialogDescription>
            Pick an available bed. On confirm you move instantly and a new bill is generated:{' '}
            <span className="font-medium text-foreground">{inr(currentFee)} → {inr(newFee)}</span>.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground py-6">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading available beds…
          </div>
        ) : beds.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No available beds right now. Close this and choose “Join waitlist” instead.
          </p>
        ) : (
          <div className="space-y-4 max-h-[360px] overflow-y-auto">
            {Object.entries(grouped).map(([group, list]) => (
              <div key={group} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{group}</p>
                <div className="flex flex-wrap gap-2">
                  {list.map((b) => (
                    <button
                      key={b.bed_id}
                      type="button"
                      onClick={() => setBedId(b.bed_id)}
                      className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
                        bedId === b.bed_id ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                      }`}
                    >
                      <BedDouble className="h-4 w-4 text-muted-foreground" />
                      {b.room_number} · Bed {b.bed_number}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upgrade.isPending}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!selected || upgrade.isPending}>
            {upgrade.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck.** Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/campus-living/my-hostel/_components/room-upgrade-bed-dialog.tsx
git commit -m "feat(campus-living): room upgrade bed-picker dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Room upgrade card

**Files:**
- Create: `app/(routes)/campus-living/my-hostel/_components/room-category-upgrade-card.tsx`

- [ ] **Step 1: Write the file**

```tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Loader2, ArrowUpCircle } from 'lucide-react';
import { useUpgradeRoomCategories, useJoinUpgradeWaitlist } from '@/hooks/campus-living/use-category-upgrade';
import { RoomUpgradeBedDialog } from './room-upgrade-bed-dialog';
import type { UpgradeRoomCategoryOption } from '@/types/campus-living/category-upgrade';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

interface Props {
  currentCategoryName: string | null;
  currentFee: number; // current room category fee (0 if none/unbilled)
}

export function RoomCategoryUpgradeCard({ currentCategoryName, currentFee }: Props) {
  const { data: options = [], isLoading } = useUpgradeRoomCategories();
  const joinWaitlist = useJoinUpgradeWaitlist();
  const [picked, setPicked] = useState<UpgradeRoomCategoryOption | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" /> Upgrade Room Category
        </CardTitle>
        <CardDescription>
          Move up to a higher room category. If a bed is free you move instantly and a new bill is
          generated; otherwise you can join the waitlist (your current stay & bill stay as-is).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground py-4">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading upgrade options…
          </div>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No higher room categories available to you right now.
          </p>
        ) : (
          options.map((opt) => (
            <div key={opt.category_id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{opt.name}</p>
                <p className="text-xs text-muted-foreground">
                  {inr(opt.current_year_fee)}
                  {currentCategoryName ? ` · from ${currentCategoryName} (${inr(currentFee)})` : ''}
                </p>
              </div>
              {opt.available_beds > 0 ? (
                <Button size="sm" onClick={() => setPicked(opt)}>
                  <ArrowUpCircle className="mr-1.5 h-4 w-4" /> Upgrade now
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">No bed free</Badge>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={joinWaitlist.isPending}
                    onClick={() => { if (!joinWaitlist.isPending) joinWaitlist.mutate(opt.category_id); }}
                  >
                    {joinWaitlist.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Join waitlist
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>

      {picked && (
        <RoomUpgradeBedDialog
          open={!!picked}
          onOpenChange={(o) => { if (!o) setPicked(null); }}
          categoryId={picked.category_id}
          categoryName={picked.name}
          currentFee={currentFee}
          newFee={picked.current_year_fee}
        />
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck.** Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/campus-living/my-hostel/_components/room-category-upgrade-card.tsx
git commit -m "feat(campus-living): room category upgrade card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Mess upgrade card

**Files:**
- Create: `app/(routes)/campus-living/my-hostel/_components/mess-category-upgrade-card.tsx`

- [ ] **Step 1: Write the file**

```tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UtensilsCrossed, Loader2, ArrowUpCircle } from 'lucide-react';
import { useUpgradeMessCategories, useUpgradeMess } from '@/hooks/campus-living/use-category-upgrade';
import type { UpgradeMessCategoryOption } from '@/types/campus-living/category-upgrade';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

interface Props {
  currentMessName: string | null;
  currentFee: number;
}

export function MessCategoryUpgradeCard({ currentMessName, currentFee }: Props) {
  const { data: options = [], isLoading } = useUpgradeMessCategories();
  const upgrade = useUpgradeMess();
  const [picked, setPicked] = useState<UpgradeMessCategoryOption | null>(null);

  const confirm = async () => {
    if (!picked || upgrade.isPending) return;
    await upgrade.mutateAsync(picked.mess_category_id);
    setPicked(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UtensilsCrossed className="h-5 w-5 text-primary" /> Upgrade Mess Category
        </CardTitle>
        <CardDescription>
          Switch to a higher mess plan. Applied instantly — your mess bill is re-issued at the new
          amount (no room change).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground py-4">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading mess options…
          </div>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No higher mess categories available to you right now.
          </p>
        ) : (
          options.map((opt) => (
            <div key={opt.mess_category_id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{opt.name}</p>
                <p className="text-xs text-muted-foreground">
                  {inr(opt.current_year_fee)}
                  {currentMessName ? ` · from ${currentMessName} (${inr(currentFee)})` : ''}
                </p>
              </div>
              <Button size="sm" onClick={() => setPicked(opt)}>
                <ArrowUpCircle className="mr-1.5 h-4 w-4" /> Upgrade
              </Button>
            </div>
          ))
        )}
      </CardContent>

      <AlertDialog open={!!picked} onOpenChange={(o) => { if (!o && !upgrade.isPending) setPicked(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upgrade mess to {picked?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your mess bill will be re-issued: {inr(currentFee)} → {inr(picked?.current_year_fee ?? 0)}.
              This applies immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={upgrade.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirm(); }} disabled={upgrade.isPending}>
              {upgrade.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Upgrading…</>) : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck.** Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/campus-living/my-hostel/_components/mess-category-upgrade-card.tsx
git commit -m "feat(campus-living): mess category upgrade card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Wire the cards into the Category & Fees tab

**Files:**
- Modify: `app/(routes)/campus-living/my-hostel/_components/category-fees-tab.tsx`

The tab already loads `summary` (`useMyHostelSummary`) and `fees` (`useMyCategoryFees`). Derive the current room fee (the `fee` row whose `mess_category_id` is null) and current mess fee (the row whose `mess_category_id` is set) to pass into the cards.

- [ ] **Step 1: Add imports** below the existing imports:

```tsx
import { RoomCategoryUpgradeCard } from './room-category-upgrade-card';
import { MessCategoryUpgradeCard } from './mess-category-upgrade-card';
```

- [ ] **Step 2: Derive current room/mess fees** — after the existing `const totalAmount = …` line, add:

```tsx
  const currentRoomFee = (fees ?? []).find((f) => !f.mess_category_id)?.amount ?? 0;
  const currentMessFee = (fees ?? []).find((f) => f.mess_category_id)?.amount ?? 0;
```

- [ ] **Step 3: Render the two upgrade cards** — inside the top-level `<div className='space-y-6'>`, after the existing "Fee breakdown" `</Card>` (the last card), add:

```tsx
      {/* Self-service upgrades */}
      <RoomCategoryUpgradeCard
        currentCategoryName={summary.hostelCategory?.name ?? null}
        currentFee={currentRoomFee}
      />
      <MessCategoryUpgradeCard
        currentMessName={summary.messCategory?.name ?? null}
        currentFee={currentMessFee}
      />
```

> The cards self-fetch their options/eligibility, so they render only meaningful upgrades. They appear for any hosteller with a category; the "no options" empty states handle the rest. (Optional polish: hide the room card when `!summary.hostelCategory` — not required.)

- [ ] **Step 4: Typecheck** `category-fees-tab.tsx`. Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(routes\)/campus-living/my-hostel/_components/category-fees-tab.tsx
git commit -m "feat(campus-living): surface room + mess upgrade cards in My Hostel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: End-to-end verification (browser + advisors)

No automated suite — verify manually as a **non-super-admin hosteller** in a dev/staging environment with category fees set in Fee Config.

- [ ] **Step 1:** `npm run dev`, log in as a hosteller, go to **My Hostel → My Category & Fees**.
- [ ] **Step 2 (room, bed available):** pick a higher room category with a free bed → "Upgrade now" → pick bed → confirm. Verify: toast shows new bill; Overview shows the new block/room/bed; in DB the old `hostel_allocations` row is `vacated`, old bed `available`, new bed `occupied`; `learners_profiles.hostel_category_id` updated; in **Billing Schedule** the old room bill is `cancelled` and a new `hostel_category` bill at the Fee Config amount appears.

```sql
-- spot check for the test learner (replace :lp)
SELECT item_category_id, fee_source, final_amount, status FROM billing_student_bills
WHERE student_id = :lp AND fee_source='hostel_category' ORDER BY created_at DESC;
```

- [ ] **Step 3 (room, no bed):** pick a category whose `available_beds = 0` → "Join waitlist". Verify: a `hostel_waitlist` row (`entry_kind='upgrade'`, `status='waiting'`, `target_hostel_category_id` set); **no** change to category/allocation/bill. Re-click → idempotent (same row).
- [ ] **Step 4 (mess):** upgrade mess category → confirm. Verify: `learners_profiles.mess_category_id` updated; old mess bill cancelled + new mess bill created; **room bill untouched** (separate line).
- [ ] **Step 5 (downgrade blocked):** the lists never show cheaper categories; calling the RPC with a cheaper category errors "Downgrades are not allowed".
- [ ] **Step 6 (paid-bill differential):** mark a room bill paid, then upgrade → new bill billed = (new − paid); old paid bill not cancelled.
- [ ] **Step 7:** `get_advisors` (security + performance) → no new warnings attributable to the new functions/columns.
- [ ] **Step 8:** if any route/permission/menu changed (none expected), run `npm run check:menus`. Confirm `npm run build` gates still pass.

---

## Self-Review (completed by plan author)

- **Spec coverage:** room upgrade+move (T4/T8/T9), mess upgrade (T4/T10), eligibility+availability gates via reused helpers (T3), upgrade-only (T3/T4), supersede+new-full / differential billing (T2), waitlist + D1 self-complete (T1/T4/T9, surfaced by the room card's "Upgrade now" reappearing once `available_beds>0`), room/mess separate lines (item_category_id), Fee Config read-only (T3/T4). ✔
- **Placeholders:** none — every step has concrete SQL/TS/commands. The two "open" items from the spec are resolved here: trigger interaction is moot (INSERT-only, T2 note); enum values confirmed (`active`/`vacated`, `waiting`/`allocated`).
- **Type consistency:** `UpgradeRoomCategoryOption`/`UpgradeMessCategoryOption`/`RoomUpgradeResult`/`MessUpgradeResult`/`UpgradeBillResult` defined in T5 are used unchanged in T6/T7/T8/T9/T10. RPC arg names (`p_new_category_id`,`p_room_id`,`p_bed_id`,`p_new_mess_category_id`,`p_target_category_id`) match between T4 SQL and T6 service. Bed fields (`bed_id`,`room_id`,`room_number`,`floor`,`block_name`,`bed_number`) match `SelfAllocationService.RoomOption`.
- **Waitlist self-complete (D1):** no extra UI needed — once a bed frees, `fn_my_upgrade_room_categories` reports `available_beds>0`, the card shows "Upgrade now", and `fn_self_upgrade_room_category` marks the waiting entry `allocated`. ✔
```
