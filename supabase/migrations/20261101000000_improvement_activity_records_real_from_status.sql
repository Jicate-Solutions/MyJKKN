-- 2026-09-01 — the Improvement Board's audit trail never recorded where an idea came from.
--
-- THE BUG
--   fn_improvement_set_status ended with:
--
--     UPDATE public.improvement_ideas SET status = p_to_status, ...
--      WHERE id = p_idea_id RETURNING * INTO v_idea;      -- v_idea now holds the NEW row
--
--     INSERT INTO public.improvement_idea_activity (..., from_status, to_status, ...)
--     VALUES (p_idea_id, auth.uid(), 'status_change', v_idea.status, p_to_status, p_note);
--                                                     ^^^^^^^^^^^^^
--   RETURNING * overwrote v_idea before the INSERT read it, so from_status was always
--   the status the row had just moved TO. Every status_change row records from == to.
--
--   Verified on production 2026-08-31: 4 of 4 rows affected
--   (withdrawn->withdrawn x3, under_review->under_review x1). The history of an idea
--   is therefore unreconstructable from this table for anything written before today.
--
-- THE FIX
--   Capture the status into a separate variable BEFORE the UPDATE and insert that.
--   Nothing else changes: the manager/author permission split, the transition guard,
--   the stamped columns and the return value are all byte-identical to the live
--   definition read from pg_get_functiondef on 2026-09-01.
--
-- EXISTING ROWS ARE NOT BACKFILLED, deliberately. The true prior status cannot be
-- recovered: 'withdrawn' is reachable from both 'logged' and 'under_review', so any
-- backfill would be a guess written into an audit table. Rows created before this
-- migration should be read as "from_status unknown".

CREATE OR REPLACE FUNCTION public.fn_improvement_set_status(
  p_idea_id   uuid,
  p_to_status public.improvement_idea_status,
  p_note      text DEFAULT NULL::text
)
RETURNS public.improvement_ideas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_idea public.improvement_ideas;
  v_is_manager boolean := (is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage'));
  v_is_author  boolean;
  -- THE FIX: hold the pre-update status, because the UPDATE's RETURNING clause
  -- below replaces v_idea wholesale and would otherwise take this with it.
  v_from_status public.improvement_idea_status;
BEGIN
  SELECT * INTO v_idea FROM public.improvement_ideas WHERE id = p_idea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'idea not found'; END IF;
  v_is_author   := (v_idea.author_id = auth.uid());
  v_from_status := v_idea.status;

  -- learner path: withdraw own idea only, and only pre-approval
  IF NOT v_is_manager THEN
    IF NOT (v_is_author AND p_to_status = 'withdrawn'
            AND v_idea.status IN ('logged','under_review')) THEN
      RAISE EXCEPTION 'not permitted: only board managers change status (authors may withdraw pre-approval)';
    END IF;
  END IF;

  -- valid transition guard
  IF NOT (
    (v_idea.status='logged'       AND p_to_status IN ('under_review','withdrawn','rejected')) OR
    (v_idea.status='under_review' AND p_to_status IN ('approved','rejected','withdrawn','not_pursued')) OR
    (v_idea.status='approved'     AND p_to_status IN ('applied','not_pursued')) OR
    (v_idea.status='applied'      AND p_to_status IN ('verified','closed')) OR
    (v_idea.status='verified'     AND p_to_status IN ('closed')) OR
    (v_idea.status = p_to_status)
  ) THEN
    RAISE EXCEPTION 'invalid transition % -> %', v_idea.status, p_to_status;
  END IF;

  UPDATE public.improvement_ideas SET
    status      = p_to_status,
    reviewed_by = CASE WHEN p_to_status='under_review' THEN auth.uid() ELSE reviewed_by END,
    reviewed_at = CASE WHEN p_to_status='under_review' THEN now()      ELSE reviewed_at END,
    approved_by = CASE WHEN p_to_status='approved'     THEN auth.uid() ELSE approved_by END,
    approved_at = CASE WHEN p_to_status='approved'     THEN now()      ELSE approved_at END,
    applied_by  = CASE WHEN p_to_status='applied'      THEN auth.uid() ELSE applied_by  END,
    applied_at  = CASE WHEN p_to_status='applied'      THEN now()      ELSE applied_at  END,
    verified_by = CASE WHEN p_to_status='verified'     THEN auth.uid() ELSE verified_by END,
    verified_at = CASE WHEN p_to_status='verified'     THEN now()      ELSE verified_at END,
    rejection_reason = CASE WHEN p_to_status='rejected' THEN COALESCE(p_note, rejection_reason) ELSE rejection_reason END
  WHERE id = p_idea_id RETURNING * INTO v_idea;

  INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, from_status, to_status, note)
  VALUES (p_idea_id, auth.uid(), 'status_change', v_from_status, p_to_status, p_note);

  RETURN v_idea;
END $function$;

-- Grants restated to match the live ACL exactly (anon=f, authenticated=t, service_role=t).
-- CREATE OR REPLACE preserves an existing ACL, but stating it keeps the migration
-- self-describing and guards against the Supabase default that grants anon EXECUTE
-- on every new function.
REVOKE EXECUTE ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) TO authenticated;

COMMENT ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) IS
  'Moves an improvement idea between statuses. Managers may make any valid transition; an author may only withdraw their own idea pre-approval. Writes an improvement_idea_activity row recording the true prior status (fixed 2026-09-01 — before that date from_status always equalled to_status).';
