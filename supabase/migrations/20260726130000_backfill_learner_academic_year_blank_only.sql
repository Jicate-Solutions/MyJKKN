-- BUG-005352 repair — backfill academic_year_id where it was never stamped.
-- ----------------------------------------------------------------------------
-- ⛔ UNAPPLIED BY DESIGN. Do NOT run as part of a routine migration sweep.
--    Apply is Director-gated and happens AFTER the paired code fix
--    (app/api/admission/bridge/convert/route.ts stamping academic_year_id at
--    profile creation) is merged and deployed — otherwise new blank rows keep
--    appearing and the counts below drift.
--
-- PREVIEW PROTOCOL (run BEFORE the real apply, via Mgmt-API):
--    BEGIN;
--      \i this file
--      SELECT * FROM public._bak_learner_academic_year_backfill_20260726;
--      SELECT * FROM public._bak_billing_bill_academic_year_backfill_20260726;
--    ROLLBACK;
--    The _bak_ tables list EXACTLY the rows the apply would touch (they are
--    populated from the same predicate the UPDATEs use). Review the lists,
--    then re-run without ROLLBACK to apply for real.
--
-- WHY: the admission bridge (convert route) created learner profiles with no
-- academic_year_id. The profile column is the ONLY source
-- trg_billing_bill_default_academic_year (20260725) can copy from when bills
-- are created at account transition (the RPC itself never sets the column),
-- and fn_learner_current_year_academic_fee (20260606160100) matches bills on
-- academic_year_id = learners_profiles.academic_year_id — NULL never matches.
--
-- ⚠️ WHAT THIS REPAIR DOES *NOT* DO (adversarial review, 2026-07-26): it does
-- NOT move today's hostel-allocation preview. The candidate cohort
-- (20260725_allocation_cohort_active_learners_only.sql) admits only
-- lifecycle_status='active' hostellers, and every one of today's candidates
-- already has a stamped profile (live check: 0 blank among candidates). This
-- repair drains the PIPELINE (pre-active learners) so that when they reach
-- account transition their bills are born stamped — it pre-empts the NEXT
-- wave of BUG-005352, it does not shrink the current queue.
--
-- VERIFY THE APPLY WITH THESE (they DO move), not the allocation preview:
--   SELECT count(*) FROM learners_profiles
--    WHERE academic_year_id IS NULL AND lifecycle_status IN
--    ('enquiry','enquiry_submitted','admitted','pending','approved',
--     'account','reserved','active','waitlisted');            -- 44 → 0
--   SELECT count(*) FROM billing_student_bills
--    WHERE academic_year_id IS NULL AND fee_source='academic'
--      AND COALESCE(status,'') NOT IN ('cancelled','superseded'); -- 59 → 28
--
-- POPULATION AT TIME OF WRITING (2026-07-26, prod):
--   * 44 learner profiles with NULL academic_year_id in live pipeline states
--     (enquiry 2, enquiry_submitted 25, admitted 15, approved 2; 'pending'
--     currently holds 0 rows but is included — it is a live pipeline state).
--     Terminal states (rejected/inactive/exited/graduated/withdrawal_pending,
--     7 rows) are deliberately NOT touched — left for manual review.
--   * 59 academic bills with NULL academic_year_id (non-cancelled), of which
--     31 are stampable here; the other 28 are deliberately excluded
--     (20 owned by terminal-state learners, ~8 fail the same-institution
--     guard — stamping those would leak a foreign institution's year).
--   Counts self-scope at apply time: every predicate is blank-only, so rows a
--   human has since filled are never overwritten.
--
-- SAFETY (mirrors 20260608121000 remap + 20260615200000 upgrade-bill backfill):
--   * Fills ONLY NULL academic_year_id fields — this migration's own UPDATEs
--     never change anything a human typed.
--   * Every directly-touched row is backed up to a _bak_ table first.
--   * KNOWN SIDE EFFECT (disclosed, adversarial review 2026-07-26): Part B's
--     bill UPDATE fires trg_bill_apply_hostel_fee_categories_upd
--     (20260612130000, statement-level AFTER UPDATE, matches
--     fee_source='academic'), whose handler may re-resolve and write
--     learners_profiles.hostel_category_id / mess_category_id for HOSTELLER
--     owners of the updated bills (COALESCE overwrite-never-wipe; wrapped in
--     EXCEPTION → cannot fail this migration). That is the fee-band → room/mess
--     category resolution the allocation flow wants, but it is a write outside
--     the blank-only guarantee — so Part 0 below backs up both category
--     columns for every Part-B owner BEFORE the update runs.
--   * Active-AY resolution is same-institution only (the ~8-migration
--     campus-living idiom); institutions with no active academic year are
--     skipped (their learners stay NULL, left for manual review). Note the
--     idiom's known limit (20260710120000): is_active is not a single-current-
--     year flag — ORDER BY start_date DESC picks the latest-starting active
--     year, which is the intended current session unless an institution has
--     pre-activated a future year.
--   * Idempotent: re-running is a no-op (blank-only predicate + ON CONFLICT).
-- ----------------------------------------------------------------------------

-- ===== PART 0 — category-column backup for Part-B owners (see SAFETY) =====
-- Captured BEFORE Part B so the trigger's category write-back is restorable.

CREATE TABLE IF NOT EXISTS public._bak_learner_hostel_mess_category_20260726 (
  learner_id            uuid PRIMARY KEY,
  hostel_category_id    uuid,
  mess_category_id      uuid,
  captured_at           timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bak_learner_hostel_mess_category_20260726
  (learner_id, hostel_category_id, mess_category_id)
SELECT DISTINCT lp.id, lp.hostel_category_id, lp.mess_category_id
FROM public.billing_student_bills bb
JOIN public.learners_profiles lp ON lp.id = bb.student_id
WHERE bb.academic_year_id IS NULL
  AND bb.fee_source = 'academic'
  AND bb.superseded_by_bill_id IS NULL
  AND COALESCE(bb.status, '') NOT IN ('cancelled', 'superseded')
ON CONFLICT (learner_id) DO NOTHING;

-- ============== PART A — learner profiles (blank-only) ==============

CREATE TABLE IF NOT EXISTS public._bak_learner_academic_year_backfill_20260726 (
  learner_id            uuid PRIMARY KEY,
  institution_id        uuid,
  lifecycle_status      text,
  old_academic_year_id  uuid,
  new_academic_year_id  uuid,
  backfilled_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bak_learner_academic_year_backfill_20260726
  (learner_id, institution_id, lifecycle_status, old_academic_year_id, new_academic_year_id)
SELECT lp.id, lp.institution_id, lp.lifecycle_status::text, lp.academic_year_id, ay.id
FROM public.learners_profiles lp
JOIN LATERAL (
  SELECT id FROM public.academic_years
  WHERE institution_id = lp.institution_id AND is_active
  ORDER BY start_date DESC LIMIT 1
) ay ON true
WHERE lp.academic_year_id IS NULL
  AND lp.lifecycle_status IN (
    'enquiry', 'enquiry_submitted', 'admitted', 'pending', 'approved',
    'account', 'reserved', 'active', 'waitlisted'
  )
ON CONFLICT (learner_id) DO NOTHING;

UPDATE public.learners_profiles lp
SET academic_year_id = b.new_academic_year_id,
    updated_at       = now()
FROM public._bak_learner_academic_year_backfill_20260726 b
WHERE lp.id = b.learner_id
  AND lp.academic_year_id IS NULL;

-- ============== PART B — academic bills (blank-only) ==============
-- Runs AFTER Part A so freshly stamped profiles propagate to their bills.
-- Same same-institution guard as trg_billing_bill_default_academic_year.
-- Scope: fee_source='academic' only — hostel/mess bills are owned by Campus
-- Living (their AY backfill was 20260615200000) and are keyed on hostel_year_id.

CREATE TABLE IF NOT EXISTS public._bak_billing_bill_academic_year_backfill_20260726 (
  bill_id               uuid PRIMARY KEY,
  student_id            uuid,
  institution_id        uuid,
  old_academic_year_id  uuid,
  new_academic_year_id  uuid,
  backfilled_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bak_billing_bill_academic_year_backfill_20260726
  (bill_id, student_id, institution_id, old_academic_year_id, new_academic_year_id)
SELECT bb.id, bb.student_id, bb.institution_id, bb.academic_year_id, lp.academic_year_id
FROM public.billing_student_bills bb
JOIN public.learners_profiles lp ON lp.id = bb.student_id
JOIN public.academic_years ay
       ON ay.id = lp.academic_year_id
      AND ay.institution_id = bb.institution_id
WHERE bb.academic_year_id IS NULL
  AND bb.fee_source = 'academic'
  AND bb.superseded_by_bill_id IS NULL
  AND COALESCE(bb.status, '') NOT IN ('cancelled', 'superseded')
ON CONFLICT (bill_id) DO NOTHING;

UPDATE public.billing_student_bills bb
SET academic_year_id = b.new_academic_year_id,
    updated_at       = now()
FROM public._bak_billing_bill_academic_year_backfill_20260726 b
WHERE bb.id = b.bill_id
  AND bb.academic_year_id IS NULL;

-- ============== Summary (visible in Mgmt-API / psql output) ==============

DO $$
DECLARE
  v_profiles integer;
  v_bills    integer;
  v_cats     integer;
BEGIN
  SELECT count(*) INTO v_profiles FROM public._bak_learner_academic_year_backfill_20260726;
  SELECT count(*) INTO v_bills    FROM public._bak_billing_bill_academic_year_backfill_20260726;
  SELECT count(*) INTO v_cats     FROM public._bak_learner_hostel_mess_category_20260726;
  RAISE NOTICE 'BUG-005352 repair: % learner profiles stamped, % academic bills stamped (blank-only). Backups: _bak_learner_academic_year_backfill_20260726 / _bak_billing_bill_academic_year_backfill_20260726 / _bak_learner_hostel_mess_category_20260726 (% owners'' category columns captured pre-trigger).',
    v_profiles, v_bills, v_cats;
END $$;
