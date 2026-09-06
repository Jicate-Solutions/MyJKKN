-- =============================================================================
-- 20260616091000_pde_validate_changes_requested.sql
-- PDE Faculty Review — add a third decision: 'changes_requested'.
-- Supersedes the validate RPC from 20260615170000_pde_faculty_review_rpcs.sql.
-- Feature #9b: "Request changes" review decision + learner edit/resubmit path.
-- =============================================================================
-- WHY:
--   Today faculty can only Validate or Reject a demonstration (the live RPC
--   accepts p_decision = 'validated' | 'rejected'). There is no way to RETURN
--   a submission for revision. Rejection is terminal and discouraging; many
--   submissions just need a fix. This adds 'changes_requested' as a third,
--   non-terminal decision.
--
-- BEHAVIOUR (only this branch is new — validated|rejected are byte-for-byte
-- identical to the superseded function):
--   * Allowed only from status 'submitted' | 'under_review' (same gate as the
--     other two decisions).
--   * Sets status back to 'draft' so the owning learner can edit + resubmit via
--     the existing draft -> submitted flow (PDEDemonstrationService.submit).
--   * raw_score is LEFT UNTOUCHED (never set on a return; a returned demo has
--     not been scored).
--   * The validator id + note are appended exactly as for validate/reject, so
--     the learner sees the reason on their demonstrations list (validator_notes
--     is already surfaced to learners as "Validator feedback").
--
-- The status machine is otherwise unchanged. Returning to 'draft' re-hides the
-- row from the faculty review queue (fn_pde_review_queue excludes draft); it
-- re-appears once the learner resubmits.
--
-- SECURITY: SECURITY DEFINER, same authorization re-check (same-institution
-- reviewer or cross-institution admin/super). REVOKE EXECUTE FROM anon, PUBLIC
-- is re-included per the CLAUDE.md mandatory rule (Supabase default-grants anon
-- EXECUTE on every new/replaced public function). NOT applied to prod here —
-- write-only; the lead reviews + applies. This migration supersedes the live
-- function.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_pde_validate_demonstration(
  p_demonstration_id uuid,
  p_decision         text,                  -- 'validated' | 'rejected' | 'changes_requested'
  p_raw_score        numeric DEFAULT NULL,  -- required when decision = 'validated'
  p_notes            text    DEFAULT NULL
)
RETURNS public.pde_demonstrations
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_demo      public.pde_demonstrations;
  v_allowed   boolean;
  v_new_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: not authenticated';
  END IF;

  IF p_decision NOT IN ('validated', 'rejected', 'changes_requested') THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: invalid decision "%" (expected validated|rejected|changes_requested)', p_decision;
  END IF;

  SELECT * INTO v_demo FROM public.pde_demonstrations WHERE id = p_demonstration_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: demonstration % not found', p_demonstration_id;
  END IF;

  -- Authorize: same-institution reviewer (or cross-institution admin/super).
  SELECT (
    me.is_super_admin = true
    OR (
      me.role = ANY (ARRAY[
        'super_admin','administrator','institution_admin',
        'dean','hod','coordinator','faculty'
      ])
      AND (
        me.role = ANY (ARRAY['super_admin','administrator'])
        OR me.institution_id = v_demo.institution_id
        OR v_demo.institution_id IS NULL
      )
    )
  )
  INTO v_allowed
  FROM public.profiles me
  WHERE me.id = v_uid;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: not authorized to validate this demonstration';
  END IF;

  -- Status machine: only an open submission can be reviewed (validated /
  -- rejected / returned for changes).
  IF v_demo.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: demonstration is "%", only submitted/under_review can be reviewed', v_demo.status;
  END IF;

  IF p_decision = 'validated' AND p_raw_score IS NULL THEN
    RAISE EXCEPTION 'fn_pde_validate_demonstration: raw_score is required when decision = validated';
  END IF;

  -- 'changes_requested' returns the demonstration to the learner as a 'draft';
  -- 'validated'/'rejected' set the status to the decision value verbatim.
  v_new_status := CASE WHEN p_decision = 'changes_requested' THEN 'draft' ELSE p_decision END;

  UPDATE public.pde_demonstrations SET
    status    = v_new_status,
    -- raw_score is set ONLY on validate; rejection + changes_requested leave it
    -- exactly as it was (a returned demo is not scored).
    raw_score = CASE WHEN p_decision = 'validated' THEN p_raw_score ELSE raw_score END,
    validator_ids = CASE
      WHEN COALESCE(validator_ids, '[]'::jsonb) @> to_jsonb(ARRAY[v_uid::text])
        THEN validator_ids
      ELSE COALESCE(validator_ids, '[]'::jsonb) || to_jsonb(v_uid::text)
    END,
    validator_notes = COALESCE(validator_notes, '{}'::jsonb)
      || jsonb_build_object(v_uid::text, COALESCE(p_notes, '')),
    updated_at = now()
  WHERE id = p_demonstration_id
  RETURNING * INTO v_demo;

  RETURN v_demo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_validate_demonstration(uuid, text, numeric, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_validate_demonstration(uuid, text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.fn_pde_validate_demonstration(uuid, text, numeric, text) IS
  'Faculty review write path for pde_demonstrations (faculty RLS is SELECT-only). Accepts validated|rejected|changes_requested. validated sets raw_score; rejected is terminal; changes_requested returns the demo to draft so the learner can edit + resubmit (raw_score untouched). Re-checks same-institution reviewer, enforces submitted/under_review entry gate, appends validator id + note. Weighted scoring stays downstream. Locked from anon.';

-- PostgREST schema cache must see the replaced function immediately.
NOTIFY pgrst, 'reload schema';
