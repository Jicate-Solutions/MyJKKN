-- ============================================================================
-- Improvement Board · department owners see their approved ideas directly
-- Created: 2026-10-06
-- Requires: 20271006100000 (hr_additional_roles.profile_id).
-- ----------------------------------------------------------------------------
-- THE PROBLEM
--   Approving an idea hands it to the department's owner, and the owner could
--   not see it. Measured on production 2026-10-06: 11 of the 12 linked
--   department owners hold none of improvement.ideas.view / .view_scoped /
--   improvement.board.manage, and improvement_ideas_select has no branch for an
--   owner or an assignee. The notice said "An improvement idea is now yours to
--   move", the link opened /improvement-board, and RLS returned zero rows.
--
-- WHAT CHANGES
--   1. fn_improvement_my_owned_area_ids() — the areas the caller currently owns.
--      SECURITY DEFINER because hr_additional_roles and staff are not readable
--      by an ordinary owner; a policy that joined them directly would silently
--      match nothing.
--   2. improvement_ideas_select gains two branches:
--        * the idea's assignee always sees it;
--        * a current department owner sees the ideas of their department from
--          'approved' onward (approved / applied / verified / closed).
--      improvement_areas_select and improvement_activity_select gain the
--      matching branches so the label and the timeline arrive with the idea.
--      Every existing branch is carried forward verbatim.
--   3. fn_improvement_area_owner_names() — owner display names per area, for
--      the "Assigned to" line on the board. Names only.
--   4. fn_improvement_set_status, on the move INTO 'approved':
--        * still assigns an unassigned idea to ONE owner (assignee_id is a
--          single profile) — now the LONGEST-standing owner, so adding a
--          co-owner does not silently take over routing — and now also an
--          account-only owner (profile_id, no team member record);
--        * a department with several owners gets the idea assigned to ALL of
--          them: the co-owners are named on the idea's timeline and told in
--          both notifications and user_notifications. Best-effort: a failure
--          there never blocks the approval.
--      The transition guard is carried forward VERBATIM from 20271006090000;
--      __tests__/lib/improvement-board/manager-transitions.test.ts mirrors it.
--
-- NOT CHANGED: an owner can READ their department's approved ideas. Moving one
-- to Applied is still a board manager's action.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Which areas does the caller own?
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_my_owned_area_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT h.improvement_area_id
    FROM public.hr_additional_roles h
    LEFT JOIN public.staff s ON s.id = h.staff_id
   WHERE h.improvement_area_id IS NOT NULL
     AND h.is_current
     AND lower(btrim(h.role_type)) = 'department_owner'
     AND auth.uid() IS NOT NULL
     AND COALESCE(s.profile_id, h.profile_id) = auth.uid();
$function$;

-- The three policies below apply TO public, so anon evaluates this function
-- too. It returns nothing without a session; without the grant an anon read of
-- these tables would raise instead of returning zero rows.
REVOKE EXECUTE ON FUNCTION public.fn_improvement_my_owned_area_ids() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_my_owned_area_ids() TO anon, authenticated;

COMMENT ON FUNCTION public.fn_improvement_my_owned_area_ids() IS
  'Improvement areas the caller currently owns (hr_additional_roles department_owner, linked by team member record or by user account). Used by the improvement_* SELECT policies; returns nothing without a session.';

-- ----------------------------------------------------------------------------
-- 2. Policies. Existing branches verbatim; new branches last.
-- ----------------------------------------------------------------------------
ALTER POLICY improvement_ideas_select ON public.improvement_ideas
USING (
  ( SELECT COALESCE(is_super_admin(), false) AS "coalesce")
  OR ( SELECT COALESCE(is_admin(), false) AS "coalesce")
  OR (author_id = ( SELECT auth.uid() AS uid))
  OR (( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)
      AND role_has_institution_access(institution_id))
  OR ((visibility = 'open'::improvement_idea_visibility)
      AND ( SELECT user_has_permission('improvement.ideas.view'::text) AS user_has_permission)
      AND role_has_institution_access(institution_id))
  OR ((visibility = 'open'::improvement_idea_visibility)
      AND ( SELECT user_has_permission('improvement.ideas.view_scoped'::text) AS user_has_permission)
      AND role_has_institution_access(institution_id))
  OR (assignee_id = ( SELECT auth.uid() AS uid))
  OR ((status = ANY (ARRAY['approved'::improvement_idea_status, 'applied'::improvement_idea_status,
                           'verified'::improvement_idea_status, 'closed'::improvement_idea_status]))
      AND (area_id IN ( SELECT public.fn_improvement_my_owned_area_ids())))
);

ALTER POLICY improvement_areas_select ON public.improvement_areas
USING (
  COALESCE(( SELECT is_super_admin() AS is_super_admin), false)
  OR COALESCE(( SELECT is_admin() AS is_admin), false)
  OR COALESCE(( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission), false)
  OR COALESCE(( SELECT user_has_permission('improvement.area_role.assign'::text) AS user_has_permission), false)
  OR COALESCE(( SELECT user_has_permission('improvement.area_policy.approve'::text) AS user_has_permission), false)
  OR (is_active AND COALESCE(( SELECT user_has_permission('improvement.ideas.view'::text) AS user_has_permission), false))
  OR (id IN ( SELECT public.fn_improvement_my_owned_area_ids()))
);

ALTER POLICY improvement_activity_select ON public.improvement_idea_activity
USING (
  ( SELECT is_super_admin() AS is_super_admin)
  OR ( SELECT is_admin() AS is_admin)
  OR (EXISTS ( SELECT 1
        FROM improvement_ideas i
       WHERE ((i.id = improvement_idea_activity.idea_id)
         AND ((i.author_id = ( SELECT auth.uid() AS uid))
           OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)
           OR ((i.visibility = 'open'::improvement_idea_visibility)
               AND ( SELECT user_has_permission('improvement.ideas.view'::text) AS user_has_permission))
           OR (i.assignee_id = ( SELECT auth.uid() AS uid))
           OR ((i.status = ANY (ARRAY['approved'::improvement_idea_status, 'applied'::improvement_idea_status,
                                      'verified'::improvement_idea_status, 'closed'::improvement_idea_status]))
               AND (i.area_id IN ( SELECT public.fn_improvement_my_owned_area_ids())))))))
);

-- ----------------------------------------------------------------------------
-- 3. Owner names per area, for the board's "Assigned to" line.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_area_owner_names()
RETURNS TABLE (area_id uuid, owner_names text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT h.improvement_area_id,
         array_agg(
           COALESCE(
             NULLIF(btrim(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), ''),
             NULLIF(btrim(p.full_name), ''),
             NULLIF(btrim(h.notes), ''),
             'Unnamed'
           )
           ORDER BY h.start_date, h.created_at
         )
    FROM public.hr_additional_roles h
    LEFT JOIN public.staff s    ON s.id = h.staff_id
    LEFT JOIN public.profiles p ON p.id = h.profile_id
   WHERE h.improvement_area_id IS NOT NULL
     AND h.is_current
     AND lower(btrim(h.role_type)) = 'department_owner'
     AND auth.uid() IS NOT NULL
   GROUP BY h.improvement_area_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_area_owner_names() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_area_owner_names() TO authenticated;

COMMENT ON FUNCTION public.fn_improvement_area_owner_names() IS
  'Display names of the current department owners of each improvement area, longest-standing first. Names only — for the board''s "Assigned to" line, which every signed-in board reader sees.';

-- ----------------------------------------------------------------------------
-- 4. Approval routes to the owners.
-- ----------------------------------------------------------------------------
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
  v_owner      uuid;
  v_owners     uuid[];
  v_told       uuid;      -- the owner fn_improvement_assign_idea already notified
  v_recipients uuid[];
  v_label      text;
  v_co_names   text;
  v_nid        uuid;
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

  -- Approval hands the idea to its department's owners. Only a manager reaches
  -- 'approved' (the learner path above allows 'withdrawn' alone), so the
  -- manager guard inside fn_improvement_assign_idea always passes here.
  IF p_to_status = 'approved'
     AND v_from_status IS DISTINCT FROM 'approved'
     AND v_idea.area_id IS NOT NULL THEN

    -- Every owner who has a user account, longest-standing first. A typed-in
    -- owner has no account and can be neither assigned nor told.
    SELECT array_agg(o.pid ORDER BY o.since, o.made) INTO v_owners
      FROM (
        SELECT pr.id AS pid, min(h.start_date) AS since, min(h.created_at) AS made
          FROM public.hr_additional_roles h
          LEFT JOIN public.staff s ON s.id = h.staff_id
          JOIN public.profiles pr  ON pr.id = COALESCE(s.profile_id, h.profile_id)
         WHERE h.improvement_area_id = v_idea.area_id
           AND h.is_current
           AND lower(btrim(h.role_type)) = 'department_owner'
         GROUP BY pr.id
      ) o;

    IF v_owners IS NOT NULL AND array_length(v_owners, 1) > 0 THEN
      -- assignee_id is one person: the longest-standing owner. A manager's
      -- earlier manual pick is kept.
      IF v_idea.assignee_id IS NULL THEN
        v_owner := v_owners[1];
        PERFORM public.fn_improvement_assign_idea(p_idea_id, v_owner);
        v_told := v_owner;
        -- Re-read so the returned row carries the assignment just made.
        SELECT * INTO v_idea FROM public.improvement_ideas WHERE id = p_idea_id;
      END IF;

      -- A department with several owners: the idea is assigned to ALL of them.
      -- assignee_id can hold only the first; the rest are recorded on the
      -- timeline and told here, and every owner reads the idea through the
      -- department-owner branch of improvement_ideas_select. Never allowed to
      -- undo the approval.
      BEGIN
        SELECT a.label INTO v_label FROM public.improvement_areas a WHERE a.id = v_idea.area_id;

        SELECT string_agg(COALESCE(NULLIF(btrim(pr.full_name), ''), 'a colleague'), ', ' ORDER BY t.ord)
          INTO v_co_names
          FROM unnest(v_owners) WITH ORDINALITY AS t(u, ord)
          JOIN public.profiles pr ON pr.id = t.u
         WHERE t.u IS DISTINCT FROM v_told;

        IF v_co_names IS NOT NULL THEN
          INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, note)
          VALUES (
            p_idea_id, auth.uid(), 'assigned',
            CASE WHEN v_told IS NULL
                 THEN 'Assigned to the owners of ' || COALESCE(v_label, 'the department') || ': ' || v_co_names || '.'
                 ELSE 'Also assigned to ' || v_co_names || ' — every owner of '
                      || COALESCE(v_label, 'the department') || ' shares this idea.'
            END
          );
        END IF;

        SELECT array_agg(u) INTO v_recipients
          FROM unnest(v_owners) AS t(u)
         WHERE u IS DISTINCT FROM v_told
           AND u IS DISTINCT FROM auth.uid();

        IF v_recipients IS NOT NULL AND array_length(v_recipients, 1) > 0 THEN
          INSERT INTO public.notifications
            (title, body, category, kind, targeting, url, priority, created_by, metadata)
          VALUES (
            'An improvement idea is now yours to move',
            '"' || v_idea.title || '" has been approved and assigned to you as an owner of '
              || COALESCE(v_label, 'your department')
              || ', together with its other owners. Open the Improvement Board to see it.',
            'improvement:assignment',
            'work_item',
            jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_recipients)),
            '/improvement-board',
            'normal',
            auth.uid(),
            jsonb_build_object(
              'source',  'improvement.approved',
              'idea_id', p_idea_id,
              'area_id', v_idea.area_id
            )
          )
          RETURNING id INTO v_nid;

          INSERT INTO public.user_notifications (notification_id, user_id)
          SELECT v_nid, r.u FROM unnest(v_recipients) AS r(u)
          ON CONFLICT (notification_id, user_id) DO NOTHING;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  RETURN v_idea;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) TO authenticated;

COMMENT ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) IS
  'Moves an improvement idea between statuses. Managers may make any valid transition; an author may only withdraw their own idea pre-approval. Writes an improvement_idea_activity row recording the true prior status. On the move INTO approved: an idea with no assignee is assigned to the longest-standing department owner of its area who has a user account (via fn_improvement_assign_idea), and every other such owner is notified. An unowned area or a typed-in owner routes to nobody and never blocks the approval.';

DO $assert$
BEGIN
  IF position('fn_improvement_my_owned_area_ids' IN (
       SELECT qual FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'improvement_ideas'
          AND policyname = 'improvement_ideas_select')) = 0 THEN
    RAISE EXCEPTION 'improvement_ideas_select has no department-owner branch';
  END IF;

  IF NOT has_function_privilege('anon', 'public.fn_improvement_my_owned_area_ids()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon cannot EXECUTE fn_improvement_my_owned_area_ids — an anon read of improvement_ideas would raise';
  END IF;

  IF has_function_privilege('anon', 'public.fn_improvement_area_owner_names()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_improvement_set_status(uuid, public.improvement_idea_status, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE an improvement RPC — the anon lock failed';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_improvement_set_status(uuid, public.improvement_idea_status, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE fn_improvement_set_status — nobody could move an idea';
  END IF;

  IF position('fn_improvement_assign_idea' IN pg_get_functiondef(
       'public.fn_improvement_set_status(uuid, public.improvement_idea_status, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_improvement_set_status does not route approved ideas to the department owner';
  END IF;
END $assert$;

COMMIT;

NOTIFY pgrst, 'reload schema';
