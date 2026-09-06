-- ============================================================================
-- Updated: 2026-07-30 — fn_update_recruitment_step_comment: an anonymous caller
-- could edit recruitment review comments, because the authorization guard
-- returned NULL instead of false and plpgsql treats a NULL IF as not-taken.
--
-- THE BUG, EXACTLY
-- The guard read:
--
--   IF NOT (
--     (v_decided_by IS NOT NULL AND v_decided_by = v_uid::text)
--     OR public.is_super_admin()
--     OR public.user_has_permission('hr.recruitment.approve.override')
--   ) THEN RAISE EXCEPTION 'Not authorized to edit this step comment';
--
-- For an unauthenticated caller `v_uid := auth.uid()` is NULL. Evaluated in the
-- definer context on production 2026-07-30 — which is what actually runs inside
-- a SECURITY DEFINER body — the three terms come back:
--
--   auth.uid()                                        NULL
--   is_super_admin()                                  false
--   user_has_permission('hr.recruitment.approve...')  false
--   ('x' IS NOT NULL AND 'x' = NULL::text)            NULL
--   NULL OR false OR false                            NULL
--   NOT NULL                                          NULL
--
-- plpgsql does not take an IF branch whose condition is NULL. So the RAISE was
-- SKIPPED and execution fell straight through to the UPDATE. The function is
-- anon-executable, so the caller needed nothing but a candidate UUID. 7 of 19
-- candidates currently carry a decided step with `decided_by` set, which is the
-- precondition, and were therefore writable by an anonymous stranger.
--
-- Note the shape: `false OR false` is false, and `NULL OR false` is NULL. The
-- guard failed OPEN precisely for the one caller it most needed to stop, and
-- behaved correctly for every logged-in user — which is why no one noticed.
--
-- This is the same NULL-fall-through class as the SECDEF super-admin guards
-- corrected on 2026-07-26. The lesson holds: a permission expression that can
-- return NULL must be COALESCEd, every time.
--
-- THE FIX — two independent barriers, either of which alone would close it:
--   1. An explicit early rejection when there is no authenticated caller. An
--      unauthenticated request can never legitimately edit a review comment, so
--      it is refused before any candidate row is even read.
--   2. COALESCE(..., false) around the whole authorization expression, so a NULL
--      from any future term fails CLOSED rather than open.
-- Plus the grant that should never have been there: EXECUTE is revoked from
-- anon and PUBLIC.
--
-- Everything else in the function is byte-for-byte the deployed body. This
-- migration changes authorization only — no behaviour change for any caller who
-- was legitimately allowed through before.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_update_recruitment_step_comment(
  p_candidate_id uuid,
  p_step_index integer,
  p_comment text
)
RETURNS hr_recruitment_candidates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_candidate public.hr_recruitment_candidates;
  v_chain jsonb;
  v_step jsonb;
  v_decided_by text;
  v_uid uuid := auth.uid();
BEGIN
  -- Barrier 1. No authenticated caller, no edit — refused before anything is
  -- read, so an anonymous request cannot even probe which candidate ids exist.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorized to edit this step comment'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.hr_recruitment_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found';
  END IF;

  v_chain := COALESCE(v_candidate.approval_chain, '[]'::jsonb);
  IF p_step_index < 0 OR p_step_index >= jsonb_array_length(v_chain) THEN
    RAISE EXCEPTION 'Invalid step index';
  END IF;

  v_step := v_chain -> p_step_index;
  v_decided_by := v_step ->> 'decided_by';

  -- Only a decided step carries an editable review comment.
  IF (v_step ->> 'status') NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Only a decided step comment can be edited';
  END IF;

  -- Barrier 2. Self-authorization: author, super-admin, or override-key holder.
  -- COALESCE is the fix — without it a NULL from any term makes the whole
  -- condition NULL, the IF is not taken, and this RAISE never fires.
  IF NOT COALESCE(
    (v_decided_by IS NOT NULL AND v_decided_by = v_uid::text)
    OR public.is_super_admin()
    OR public.user_has_permission('hr.recruitment.approve.override'),
    false
  ) THEN
    RAISE EXCEPTION 'Not authorized to edit this step comment'
      USING ERRCODE = '42501';
  END IF;

  v_step := v_step || jsonb_build_object(
    'comment', p_comment,
    'edited_by', v_uid::text,
    'edited_at', now()
  );
  v_chain := jsonb_set(v_chain, ARRAY[p_step_index::text], v_step);

  UPDATE public.hr_recruitment_candidates
    SET approval_chain = v_chain
    WHERE id = p_candidate_id
    RETURNING * INTO v_candidate;

  RETURN v_candidate;
END;
$function$;

-- Both roles. This function carried no explicit anon=X entry — anon reached it
-- through PUBLIC's =X/postgres grant, so revoking anon alone would have reported
-- success and changed nothing.
REVOKE EXECUTE ON FUNCTION public.fn_update_recruitment_step_comment(uuid, integer, text)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_update_recruitment_step_comment(uuid, integer, text)
  TO authenticated;

-- Apply-time assert: prove the grant actually moved, and that the guard now
-- returns a real false rather than NULL for an unauthenticated caller.
DO $$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.fn_update_recruitment_step_comment(uuid, integer, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'anon still holds EXECUTE on fn_update_recruitment_step_comment';
  END IF;

  IF NOT COALESCE(
       (NOT COALESCE(
          ('sentinel' IS NOT NULL AND 'sentinel' = (NULL::uuid)::text)
          OR public.is_super_admin()
          OR public.user_has_permission('hr.recruitment.approve.override'),
          false)),
       false) THEN
    RAISE EXCEPTION
      'guard still fails open: the COALESCEd expression did not reject a NULL caller';
  END IF;
END $$;
