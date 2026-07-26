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
-- academic_year_id. Every year-keyed read then failed silently:
--   * fn_learner_current_year_academic_fee (20260606160100) matches bills on
--     academic_year_id = learners_profiles.academic_year_id → NULL never matches
--   * trg_billing_bill_default_academic_year (20260725) copies the year FROM
--     the profile onto new bills → NULL propagates
--   * fn_auto_allocate_candidates (20260608120000) then emits
--     block_reason='prerequisite' → learner reads as "not eligible" for hostel
--     allocation despite fees being fully configured.
--
-- POPULATION AT TIME OF WRITING (2026-07-26, prod):
--   * 44 learner profiles with NULL academic_year_id in live pipeline states
--     (enquiry 2, enquiry_submitted 25, admitted 15, approved 2). Terminal
--     states (rejected/inactive/exited/graduated/withdrawal_pending, 7 rows)
--     are deliberately NOT touched — left for manual review.
--   * 59 academic bills with NULL academic_year_id (non-cancelled).
--   Counts self-scope at apply time: every predicate is blank-only, so rows a
--   human has since filled are never overwritten.
--
-- SAFETY (mirrors 20260608121000 remap + 20260615200000 upgrade-bill backfill):
--   * Fills ONLY NULL fields — nothing a human typed is ever changed.
--   * Every touched row is backed up to a _bak_ table first.
--   * Active-AY resolution is same-institution only (the ~8-migration
--     campus-living idiom); institutions with no active academic year are
--     skipped (their learners stay NULL, left for manual review).
--   * Idempotent: re-running is a no-op (blank-only predicate + ON CONFLICT).
-- ----------------------------------------------------------------------------

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
    'enquiry', 'enquiry_submitted', 'admitted', 'approved',
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
BEGIN
  SELECT count(*) INTO v_profiles FROM public._bak_learner_academic_year_backfill_20260726;
  SELECT count(*) INTO v_bills    FROM public._bak_billing_bill_academic_year_backfill_20260726;
  RAISE NOTICE 'BUG-005352 repair: % learner profiles stamped, % academic bills stamped (blank-only; row lists in _bak_learner_academic_year_backfill_20260726 / _bak_billing_bill_academic_year_backfill_20260726)',
    v_profiles, v_bills;
END $$;
