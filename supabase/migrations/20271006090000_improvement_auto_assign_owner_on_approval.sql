-- ============================================================================
-- Improvement Board · approving an idea hands it to the department owner
-- Created: 2026-10-06
-- ----------------------------------------------------------------------------
-- WHAT CHANGES
--   When fn_improvement_set_status moves an idea INTO 'approved', and the idea
--   has no assignee yet, it is assigned to the current department owner of the
--   idea's area (hr_additional_roles.role_type = 'department_owner', the row
--   /improvement-board/owners writes). A Transport idea goes to the Transport
--   owner, a Library idea to the Library owner, and so on.
--
-- WHY NOW
--   20261110000000 left auto-routing unbuilt on purpose: only 4 of the 10 areas
--   in use had an owner, so it would have looked solved while leaving most
--   ideas unrouted. On 2026-10-06 the owners were named from the department
--   contact list — 13 of 14 active areas — which removes that objection.
--
-- HOW, AND WHAT IT DELIBERATELY DOES NOT DO
--   * The assignment itself goes through fn_improvement_assign_idea, still the
--     ONLY writer of assignee_id / assigned_by / assigned_at. The owner
--     therefore gets the same stamps, the same 'assigned' timeline row and the
--     same notification in BOTH notifications and user_notifications as a
--     manual assignment. The approver is recorded as assigned_by.
--   * An idea that already has an assignee keeps them. A manager's manual pick
--     is a deliberate act and approval does not overwrite it.
--   * Only a LINKED owner can receive an idea: assignee_id is a profile, so the
--     owner row needs staff_id -> staff.profile_id. A typed-in owner (staff_id
--     NULL) or an unowned area assigns nobody and the approval still succeeds —
--     an unroutable idea must never block the status change.
--   * Fires on the transition only (from_status <> 'approved'), so re-saving an
--     already-approved idea does not re-assign one a manager has since cleared.
--
--   The transition guard below is carried forward VERBATIM from
--   20261101000000_improvement_activity_records_real_from_status.sql;
--   __tests__/lib/improvement-board/manager-transitions.test.ts mirrors it.
-- ============================================================================

BEGIN;

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
  v_owner uuid;
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

  -- Approval hands the idea to its department's owner. Only a manager reaches
  -- 'approved' (the learner path above allows 'withdrawn' alone), so the
  -- manager guard inside fn_improvement_assign_idea always passes here.
  IF p_to_status = 'approved'
     AND v_from_status IS DISTINCT FROM 'approved'
     AND v_idea.assignee_id IS NULL
     AND v_idea.area_id IS NOT NULL THEN
    SELECT s.profile_id INTO v_owner
      FROM public.hr_additional_roles h
      JOIN public.staff s     ON s.id  = h.staff_id
      JOIN public.profiles pr ON pr.id = s.profile_id
     WHERE h.improvement_area_id = v_idea.area_id
       AND h.is_current
       AND lower(btrim(h.role_type)) = 'department_owner'
     ORDER BY h.start_date DESC, h.created_at DESC
     LIMIT 1;

    IF v_owner IS NOT NULL THEN
      PERFORM public.fn_improvement_assign_idea(p_idea_id, v_owner);
      -- Re-read so the returned row carries the assignment just made.
      SELECT * INTO v_idea FROM public.improvement_ideas WHERE id = p_idea_id;
    END IF;
  END IF;

  RETURN v_idea;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) TO authenticated;

COMMENT ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) IS
  'Moves an improvement idea between statuses. Managers may make any valid transition; an author may only withdraw their own idea pre-approval. Writes an improvement_idea_activity row recording the true prior status. On the move INTO approved, an idea with no assignee is assigned to the current linked department_owner of its area via fn_improvement_assign_idea (added 2026-10-06); an unowned area or a typed-in owner assigns nobody and never blocks the approval.';

COMMENT ON FUNCTION public.fn_improvement_assign_idea(uuid, uuid) IS
  'THE only write path for improvement_ideas.assignee_id / assigned_by / assigned_at. A board manager names one accountable person for one idea; NULL clears it. Writes the timeline row and notifies the assignee in BOTH notifications and user_notifications, so the notice actually reaches a bell. Changes no idea status. Also called by fn_improvement_set_status, which routes an unassigned idea to its department owner on approval.';

DO $assert$
BEGIN
  IF position('fn_improvement_assign_idea' IN pg_get_functiondef(
       'public.fn_improvement_set_status(uuid, public.improvement_idea_status, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_improvement_set_status does not route approved ideas to the department owner';
  END IF;

  IF has_function_privilege('anon', 'public.fn_improvement_set_status(uuid, public.improvement_idea_status, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE fn_improvement_set_status — the anon lock failed';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_improvement_set_status(uuid, public.improvement_idea_status, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE fn_improvement_set_status — nobody could move an idea';
  END IF;
END $assert$;

COMMIT;

NOTIFY pgrst, 'reload schema';
