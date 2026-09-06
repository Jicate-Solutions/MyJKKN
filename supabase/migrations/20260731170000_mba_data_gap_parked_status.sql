-- ============================================================================
-- MBA Teaching-Enterprise · Data-Gap "someday" wishlist (parked status)
-- Created: 2026-07-26
-- ----------------------------------------------------------------------------
-- Rulebook decision #4 (user interview 2026-07-26): keep a VISIBLE "someday"
-- wishlist — a place for gaps a manager doesn't want to act on NOW but doesn't
-- want to reject either. Distinct from 'not_feasible' (won't do) and 'duplicate'
-- (already filed). A parked gap is deferred, not dismissed.
--
-- Adds a new `parked` status. Two enforcement points move together:
--   1. the table CHECK constraint on mba_data_gaps.status, and
--   2. the validation IN-list inside fn_mba_triage_data_gap.
-- (The TypeScript DataGapStatus union is the third, updated in the app layer.)
--
-- Parking is REVERSIBLE — the triage RPC already accepts moving a gap back to
-- 'triaged', so the UI re-opens a parked gap into the live queue with no schema
-- change. Parking does NOT materialise an improvement idea (only 'accepted'
-- does), so a wishlist item costs the board nothing until it is genuinely
-- picked up.
--
-- Non-destructive: additive status value only; mba_data_gaps is empty in prod
-- (0 rows verified 2026-07-26), so widening the constraint cannot orphan a row.
--
-- Cross-PR note: #2458 (data-gap measurement, still open at write time) adds
-- fn_mba_measure_gap_outcomes whose CASE classifies accepted/not_feasible/
-- captured_elsewhere/duplicate. When BOTH land, that CASE should treat 'parked'
-- as a pending/neutral outcome (it is neither a win nor a resolved no-op). No
-- change is made to #2458 here — it does not exist on main yet.
-- ============================================================================

BEGIN;

-- 1) Widen the status CHECK to include 'parked' ------------------------------
ALTER TABLE public.mba_data_gaps
  DROP CONSTRAINT IF EXISTS mba_data_gaps_status_check;
ALTER TABLE public.mba_data_gaps
  ADD CONSTRAINT mba_data_gaps_status_check
  CHECK (status IN (
    'filed','triaged','accepted','not_feasible','captured_elsewhere','duplicate','parked'
  ));

COMMENT ON COLUMN public.mba_data_gaps.status IS
  'Triage lifecycle. parked = a visible "someday" wishlist: deferred, not rejected; reversible back to triaged. Only accepted materialises a linked improvement idea.';

-- 2) fn_mba_triage_data_gap — allow setting 'parked' -------------------------
-- Identical to the Phase-1 body except 'parked' is added to the accepted set.
-- The accept-branch is unchanged (fires only on 'accepted'), so parking never
-- spawns a linked idea. REVOKE/GRANT preserved (anon has NO execute).
CREATE OR REPLACE FUNCTION public.fn_mba_triage_data_gap(
  p_gap_id uuid,
  p_status text,
  p_note   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gap public.mba_data_gaps;
  v_institution_id uuid;
  v_new_idea_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage')) THEN
    RAISE EXCEPTION 'Only Improvement Board managers can triage a data gap.';
  END IF;
  IF p_status NOT IN ('filed','triaged','accepted','not_feasible','captured_elsewhere','duplicate','parked') THEN
    RAISE EXCEPTION 'Invalid triage status: %', p_status;
  END IF;

  SELECT * INTO v_gap FROM public.mba_data_gaps WHERE id = p_gap_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data gap not found.';
  END IF;

  -- HYBRID: accepting an un-linked gap materialises a linked improvement idea.
  IF p_status = 'accepted' AND v_gap.linked_idea_id IS NULL THEN
    -- improvement_ideas.institution_id is NOT NULL; fall back from the gap to
    -- the filer's, then the manager's, institution so accept never fails with a
    -- cryptic constraint error.
    v_institution_id := coalesce(
      v_gap.institution_id,
      (SELECT institution_id FROM public.profiles WHERE id = v_gap.filed_by),
      (SELECT institution_id FROM public.profiles WHERE id = v_uid)
    );
    IF v_institution_id IS NULL THEN
      RAISE EXCEPTION 'Cannot accept: no institution is set for the person who filed this gap.';
    END IF;

    INSERT INTO public.improvement_ideas (
      institution_id, area_id, author_id, title, problem, proposed_fix,
      expected_impact, contributors, attachments, is_urgent, status, visibility
    ) VALUES (
      v_institution_id,
      v_gap.area_id,
      v_gap.filed_by,
      '[Data gap] ' || v_gap.title,
      v_gap.what_missing,
      coalesce(v_gap.what_analysis, 'Capture or surface this data'),
      v_gap.what_decision,
      '[]'::jsonb,
      '[]'::jsonb,
      false,
      'logged',
      'open'
    )
    RETURNING id INTO v_new_idea_id;
  END IF;

  UPDATE public.mba_data_gaps SET
    status         = p_status,
    triaged_by     = v_uid,
    triaged_at     = now(),
    triage_note    = p_note,
    linked_idea_id = coalesce(v_new_idea_id, linked_idea_id)
  WHERE id = p_gap_id
  RETURNING linked_idea_id INTO v_new_idea_id;

  RETURN v_new_idea_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_triage_data_gap(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_triage_data_gap(uuid, text, text) TO authenticated;

COMMIT;
