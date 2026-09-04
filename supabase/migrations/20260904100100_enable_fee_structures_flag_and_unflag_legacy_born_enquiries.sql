-- =============================================================================
-- 20260904100100_enable_fee_structures_flag_and_unflag_legacy_born_enquiries.sql
--
-- Companion to 20260904100000. That file made the preview honest; this one
-- stops the condition from being created and clears the rows it already
-- created.
--
-- §1 THE FLAG
-- -----------
-- admission_settings_per_institution.use_fee_structures was switched on for
-- two colleges on 2026-06-21 and left off for every other one — including
-- Dental (20 active structures), Pharmacy (48), Engineering (67), Nursing (32)
-- and Allied Health (36). The flag has exactly two readers: the BEFORE INSERT
-- trigger that decides whether a new learner is legacy, and the "Migrate to
-- fee structure" banner on the Finance tab. With the flag off, every new
-- enquiry at those colleges was born legacy_fee_mode = true with an empty
-- snapshot, and the matrix those colleges maintain was never consulted for it.
--
-- The rule is data-driven, not a list of names: any institution with at least
-- one ACTIVE fee structure gets the flag on. An institution with no structures
-- stays off, because turning it on there would only make new enquiries fail
-- with "no matching structure" instead of carrying a legacy snapshot.
--
-- §2 THE ROWS
-- -----------
-- Pre-account learners that are legacy with an EMPTY snapshot and for which
-- the matrix DOES resolve a structure are flipped to legacy_fee_mode = false.
-- This is exactly the write admission_account_transition_with_bills performs
-- on Confirm and what the insert trigger would have done had the flag been on.
-- Measured 2026-09-04: 127 rows.
--
-- Deliberately NOT touched:
--   • legacy rows with a non-empty snapshot — those carry real legacy fees;
--   • legacy rows the matrix cannot resolve — they still need fee setup, and
--     legacy mode is what surfaces them in the "Fees Setup Pending" tab;
--   • anything at or past 'account' — historic.
--
-- fee_items stays '[]' on the flipped rows. The persisting resolver writes it
-- on the next dimension change or on Confirm, the same as for every other
-- matrix-driven learner; 75 enquiry_submitted rows already live in that state.
--
-- TRIGGER SAFETY: every UPDATE trigger on learners_profiles is guarded on the
-- columns it cares about (trigger_detect_fee_dimension_change returns early
-- on any legacy_fee_mode change; validate_learner_semester_year_scope only
-- re-validates FKs that changed), so a flip of legacy_fee_mode alone fires no
-- trigger body. Verified against the live definitions on 2026-09-04.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

-- §1 -------------------------------------------------------------------------
DO $flag$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.admission_settings_per_institution s
     SET use_fee_structures = true,
         updated_at         = now()
   WHERE s.use_fee_structures = false
     AND EXISTS (
           SELECT 1 FROM public.admission_fee_structures fs
            WHERE fs.institution_id = s.institution_id
              AND fs.status = 'active'
         );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'use_fee_structures switched on for % institution(s) that already have active structures', v_n;
END
$flag$;

-- §2 -------------------------------------------------------------------------
DO $rows$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.learners_profiles lp
     SET legacy_fee_mode = false,
         updated_at      = now()
   WHERE lp.legacy_fee_mode = true
     AND (lp.fee_items IS NULL OR jsonb_array_length(lp.fee_items) = 0)
     AND lp.lifecycle_status IN ('enquiry', 'enquiry_submitted', 'pending', 'approved')
     AND public.admission_match_fee_structure_for_learner(lp.id) IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'legacy_fee_mode cleared on % pre-account learner(s) born legacy whose dimensions resolve a fee structure', v_n;
END
$rows$;
