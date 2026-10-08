-- ============================================================================
-- Improvement Board · who an idea is with, stage by stage
-- Created: 2026-10-07
-- Requires: 20271006100000, 20271006110000 (both applied 2026-10-06).
-- ----------------------------------------------------------------------------
-- THE FLOW (Director, 2026-10-07)
--   Filed (Logged)      -> assigned to the CEO automatically.
--   Under Review        -> assigned to the owner(s) of the idea's department.
--   Owner reviews       -> the OWNER may approve it (or reject / not pursue).
--   Approved            -> the owner picks the people who will carry it out,
--                          by search, as many as needed.
--
-- WHY A TABLE
--   improvement_ideas.assignee_id holds one person. Every stage above can name
--   several, so the people an idea is with now live in
--   improvement_idea_assignees (one row per idea + person). The old column is
--   left as it is and no longer written by the status RPC; its one live value
--   is copied across by the backfill below.
--
--   The row keeps the person's NAME as it was when they were assigned. A board
--   reader cannot read public.profiles for other people, and a name that is
--   visible only to managers would leave the "Assigned to" line blank for the
--   very people it is addressed to.
--
-- WHAT CHANGES
--   1. improvement_idea_assignees + its RLS.
--   2. fn_improvement_assignees_apply  — internal; the ONLY writer of that
--      table. Timeline row + bell notification for everyone newly added.
--   3. Trigger on improvement_ideas INSERT: a new idea goes to the CEO. The
--      address is platform policy improvement.new_idea_assignee_email, default
--      ceo@jkkn.ac.in. Filing an idea can never fail because of it.
--   4. fn_improvement_set_status:
--        * moving INTO under_review hands the idea to the department owners;
--        * a department owner may now decide an idea that is under review
--          (approve / reject / not pursue) — until now only a board manager;
--        * approval no longer assigns anybody by itself (it did, from
--          20271006090000 / 20271006110000): the owner picks the people.
--      The transition graph itself is unchanged and carried forward verbatim.
--   5. fn_improvement_set_assignees — the owner's (or a manager's) manual pick.
--   6. SELECT policies: an assignee always sees their idea; an owner sees their
--      department's ideas from under_review onward (was: from approved).
--   7. Backfill for the ideas already on the board. No notifications.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The table.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.improvement_idea_assignees (
  idea_id       uuid NOT NULL REFERENCES public.improvement_ideas(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assignee_name text NOT NULL,
  assigned_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_improvement_idea_assignees_profile
  ON public.improvement_idea_assignees (profile_id);

COMMENT ON TABLE public.improvement_idea_assignees IS
  'The people an improvement idea is currently with: the CEO while Logged, the department owners while Under Review, then whoever the owner picks. Written ONLY by fn_improvement_assignees_apply. assignee_name is the name as it was when assigned, so every board reader can show it.';

ALTER TABLE public.improvement_idea_assignees ENABLE ROW LEVEL SECURITY;

-- Readable by whoever can read the idea: the subquery runs under the reader's
-- own improvement_ideas policy. No INSERT / UPDATE / DELETE policy on purpose —
-- every write goes through the SECURITY DEFINER function below.
DROP POLICY IF EXISTS improvement_idea_assignees_select ON public.improvement_idea_assignees;
CREATE POLICY improvement_idea_assignees_select ON public.improvement_idea_assignees
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.improvement_ideas i WHERE i.id = improvement_idea_assignees.idea_id)
);

REVOKE ALL ON public.improvement_idea_assignees FROM anon;
GRANT SELECT ON public.improvement_idea_assignees TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Ideas assigned to the caller. SECURITY DEFINER so the improvement_ideas
--    policy can use it without reading improvement_idea_assignees through that
--    table's own policy (which reads improvement_ideas — infinite recursion).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_my_assigned_idea_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT a.idea_id
    FROM public.improvement_idea_assignees a
   WHERE auth.uid() IS NOT NULL
     AND a.profile_id = auth.uid();
$function$;

-- Policies apply TO public, so anon evaluates this too; it returns nothing
-- without a session.
REVOKE EXECUTE ON FUNCTION public.fn_improvement_my_assigned_idea_ids() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_my_assigned_idea_ids() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. The one writer.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_assignees_apply(
  p_idea_id     uuid,
  p_profile_ids uuid[],
  p_actor       uuid,
  p_reason      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids     uuid[];
  v_added   uuid[];
  v_removed integer;
  v_title   text;
  v_status  public.improvement_idea_status;
  v_names   text;
  v_notify  uuid[];
  v_nid     uuid;
BEGIN
  SELECT i.title, i.status INTO v_title, v_status
    FROM public.improvement_ideas i WHERE i.id = p_idea_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Improvement idea not found.';
  END IF;

  -- Distinct, real profiles only, in the order given.
  SELECT COALESCE(array_agg(t.u ORDER BY t.ord), '{}'::uuid[]) INTO v_ids
    FROM (
      SELECT x.u, min(x.ord) AS ord
        FROM unnest(COALESCE(p_profile_ids, '{}'::uuid[])) WITH ORDINALITY AS x(u, ord)
       WHERE x.u IS NOT NULL
       GROUP BY x.u
    ) t
    JOIN public.profiles pr ON pr.id = t.u;

  DELETE FROM public.improvement_idea_assignees a
   WHERE a.idea_id = p_idea_id
     AND NOT (a.profile_id = ANY (v_ids));
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  WITH ins AS (
    INSERT INTO public.improvement_idea_assignees (idea_id, profile_id, assignee_name, assigned_by)
    SELECT p_idea_id, pr.id,
           COALESCE(NULLIF(btrim(pr.full_name), ''), NULLIF(btrim(pr.email), ''), 'Unnamed'),
           p_actor
      FROM unnest(v_ids) AS t(u)
      JOIN public.profiles pr ON pr.id = t.u
    ON CONFLICT (idea_id, profile_id) DO NOTHING
    RETURNING profile_id
  )
  SELECT array_agg(profile_id) INTO v_added FROM ins;

  -- Nothing changed: no timeline row, no bell. A double-clicked Save is not an event.
  IF v_removed = 0 AND v_added IS NULL THEN
    RETURN;
  END IF;

  SELECT string_agg(a.assignee_name, ', ' ORDER BY a.assignee_name) INTO v_names
    FROM public.improvement_idea_assignees a WHERE a.idea_id = p_idea_id;

  INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, note)
  VALUES (
    p_idea_id, p_actor,
    CASE WHEN v_names IS NULL THEN 'unassigned' ELSE 'assigned' END,
    CASE WHEN v_names IS NULL
         THEN 'Nobody is assigned now.'
         ELSE COALESCE(NULLIF(btrim(p_reason), '') || ' ', '') || 'Assigned to ' || v_names || '.'
    END
  );

  -- Tell the people newly added, in BOTH tables (the bell reads the junction).
  -- Never allowed to undo the assignment itself.
  BEGIN
    SELECT array_agg(u) INTO v_notify
      FROM unnest(COALESCE(v_added, '{}'::uuid[])) AS t(u)
     WHERE u IS DISTINCT FROM p_actor;

    IF v_notify IS NOT NULL AND array_length(v_notify, 1) > 0 THEN
      INSERT INTO public.notifications
        (title, body, category, kind, targeting, url, priority, created_by, metadata)
      VALUES (
        'An improvement idea is now with you',
        '"' || v_title || '" has been assigned to you. It is currently in '
          || replace(v_status::text, '_', ' ')
          || '. Open the Improvement Board to see it.',
        'improvement:assignment',
        'work_item',
        jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_notify)),
        '/improvement-board',
        'normal',
        COALESCE(p_actor, v_notify[1]),
        jsonb_build_object('source', 'improvement.assignment', 'idea_id', p_idea_id)
      )
      RETURNING id INTO v_nid;

      INSERT INTO public.user_notifications (notification_id, user_id)
      SELECT v_nid, r.u FROM unnest(v_notify) AS r(u)
      ON CONFLICT (notification_id, user_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

-- Internal: reached only from the functions below, never through the API.
REVOKE EXECUTE ON FUNCTION public.fn_improvement_assignees_apply(uuid, uuid[], uuid, text) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_improvement_assignees_apply(uuid, uuid[], uuid, text) IS
  'INTERNAL. The only writer of improvement_idea_assignees: makes the given people the idea''s assignees (removing anyone not listed), writes one timeline row, and notifies the people newly added. Not executable by API roles — callers are the new-idea trigger, fn_improvement_set_status and fn_improvement_set_assignees.';

-- ----------------------------------------------------------------------------
-- 4. A new idea goes to the CEO.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_new_idea_assignee()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT pr.id
    FROM public.profiles pr
   WHERE lower(pr.email) = lower(btrim(
           public.fn_get_policy_text('improvement.new_idea_assignee_email', 'ceo@jkkn.ac.in')))
     AND COALESCE(pr.is_active, true)
   ORDER BY pr.id
   LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_new_idea_assignee() FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.fn_improvement_idea_assign_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_to uuid;
BEGIN
  -- Filing an idea must never fail because routing it did.
  BEGIN
    IF NEW.status = 'logged' THEN
      v_to := public.fn_improvement_new_idea_assignee();
      IF v_to IS NOT NULL THEN
        PERFORM public.fn_improvement_assignees_apply(
          NEW.id, ARRAY[v_to], NEW.author_id, 'New idea.');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_idea_assign_on_insert() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_improvement_ideas_assign_on_insert ON public.improvement_ideas;
CREATE TRIGGER trg_improvement_ideas_assign_on_insert
  AFTER INSERT ON public.improvement_ideas
  FOR EACH ROW EXECUTE FUNCTION public.fn_improvement_idea_assign_on_insert();

-- ----------------------------------------------------------------------------
-- 5. Status moves.
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
  v_is_owner   boolean;
  -- THE FIX: hold the pre-update status, because the UPDATE's RETURNING clause
  -- below replaces v_idea wholesale and would otherwise take this with it.
  v_from_status public.improvement_idea_status;
  v_owners uuid[];
  v_label  text;
BEGIN
  SELECT * INTO v_idea FROM public.improvement_ideas WHERE id = p_idea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'idea not found'; END IF;
  v_is_author   := (v_idea.author_id = auth.uid());
  v_from_status := v_idea.status;
  v_is_owner    := v_idea.area_id IS NOT NULL
                   AND v_idea.area_id IN (SELECT public.fn_improvement_my_owned_area_ids());

  IF NOT v_is_manager THEN
    IF v_is_owner
       AND v_idea.status = 'under_review'
       AND p_to_status IN ('approved', 'rejected', 'not_pursued') THEN
      -- owner path: decide an idea of their own department that is under review
      NULL;
    ELSIF NOT (v_is_author AND p_to_status = 'withdrawn'
               AND v_idea.status IN ('logged','under_review')) THEN
      -- learner path: withdraw own idea only, and only pre-approval
      RAISE EXCEPTION 'not permitted: only board managers change status (a department owner may decide an idea under review; authors may withdraw pre-approval)';
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

  -- Under Review hands the idea to the owners of its department — every owner
  -- who has a user account, longest-standing first. A department with no such
  -- owner keeps whoever the idea is already with (the CEO), so it is never
  -- left with nobody. Never allowed to undo the status move.
  IF p_to_status = 'under_review'
     AND v_from_status IS DISTINCT FROM 'under_review'
     AND v_idea.area_id IS NOT NULL THEN
    BEGIN
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
        SELECT a.label INTO v_label FROM public.improvement_areas a WHERE a.id = v_idea.area_id;
        PERFORM public.fn_improvement_assignees_apply(
          p_idea_id, v_owners, auth.uid(),
          'Under review — with the owners of ' || COALESCE(v_label, 'the department') || '.');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN v_idea;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) TO authenticated;

COMMENT ON FUNCTION public.fn_improvement_set_status(uuid, public.improvement_idea_status, text) IS
  'Moves an improvement idea between statuses. Board managers may make any valid transition; a department owner may decide an idea of their own department that is under review (approve / reject / not pursue); an author may only withdraw their own idea pre-approval. Writes an improvement_idea_activity row recording the true prior status. Moving INTO under_review assigns the idea to its department owners (improvement_idea_assignees). Approval assigns nobody by itself — the owner picks the people with fn_improvement_set_assignees.';

-- ----------------------------------------------------------------------------
-- 6. The manual pick.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_set_assignees(
  p_idea_id     uuid,
  p_profile_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_area   uuid;
  v_status public.improvement_idea_status;
  v_is_manager boolean := (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
                           OR COALESCE(user_has_permission('improvement.board.manage'), false));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  SELECT i.area_id, i.status INTO v_area, v_status
    FROM public.improvement_ideas i WHERE i.id = p_idea_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Improvement idea not found.';
  END IF;

  IF NOT v_is_manager THEN
    IF NOT (v_area IS NOT NULL
            AND v_area IN (SELECT public.fn_improvement_my_owned_area_ids())) THEN
      RAISE EXCEPTION 'Only the owner of this department, or an Improvement Board manager, can assign this idea.';
    END IF;
    IF v_status NOT IN ('approved', 'applied') THEN
      RAISE EXCEPTION 'Approve the idea first — people are assigned once it is approved.';
    END IF;
  END IF;

  IF COALESCE(array_length(p_profile_ids, 1), 0) > 25 THEN
    RAISE EXCEPTION 'An idea can be assigned to at most 25 people.';
  END IF;

  PERFORM public.fn_improvement_assignees_apply(p_idea_id, p_profile_ids, auth.uid(), NULL);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_set_assignees(uuid, uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_set_assignees(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.fn_improvement_set_assignees(uuid, uuid[]) IS
  'Sets the people an improvement idea is assigned to (replaces the current list; an empty list clears it). A board manager may do this at any stage; the owner of the idea''s department once it is approved or applied.';

-- ----------------------------------------------------------------------------
-- 7. Who can read what. Existing branches verbatim; changes are the last two
--    lines of each: the assignee branch, and under_review added for owners.
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
  OR (id IN ( SELECT public.fn_improvement_my_assigned_idea_ids()))
  OR ((status = ANY (ARRAY['under_review'::improvement_idea_status, 'approved'::improvement_idea_status,
                           'applied'::improvement_idea_status, 'verified'::improvement_idea_status,
                           'closed'::improvement_idea_status]))
      AND (area_id IN ( SELECT public.fn_improvement_my_owned_area_ids())))
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
           OR (i.id IN ( SELECT public.fn_improvement_my_assigned_idea_ids()))
           OR ((i.status = ANY (ARRAY['under_review'::improvement_idea_status, 'approved'::improvement_idea_status,
                                      'applied'::improvement_idea_status, 'verified'::improvement_idea_status,
                                      'closed'::improvement_idea_status]))
               AND (i.area_id IN ( SELECT public.fn_improvement_my_owned_area_ids())))))))
);

-- ----------------------------------------------------------------------------
-- 8. Backfill the ideas already on the board. Direct inserts: no timeline row
--    and no notification for work that was handed out before this existed.
-- ----------------------------------------------------------------------------
-- Logged -> the CEO.
INSERT INTO public.improvement_idea_assignees (idea_id, profile_id, assignee_name)
SELECT i.id, pr.id, COALESCE(NULLIF(btrim(pr.full_name), ''), pr.email, 'Unnamed')
  FROM public.improvement_ideas i
  JOIN public.profiles pr ON pr.id = public.fn_improvement_new_idea_assignee()
 WHERE i.status = 'logged'
ON CONFLICT (idea_id, profile_id) DO NOTHING;

-- Approved onward -> the person already named on the idea, if any.
INSERT INTO public.improvement_idea_assignees (idea_id, profile_id, assignee_name)
SELECT i.id, pr.id, COALESCE(NULLIF(btrim(pr.full_name), ''), pr.email, 'Unnamed')
  FROM public.improvement_ideas i
  JOIN public.profiles pr ON pr.id = i.assignee_id
 WHERE i.status IN ('approved', 'applied', 'verified')
ON CONFLICT (idea_id, profile_id) DO NOTHING;

-- Under Review, and Approved with nobody named -> the department owners.
INSERT INTO public.improvement_idea_assignees (idea_id, profile_id, assignee_name)
SELECT DISTINCT i.id, pr.id, COALESCE(NULLIF(btrim(pr.full_name), ''), pr.email, 'Unnamed')
  FROM public.improvement_ideas i
  JOIN public.hr_additional_roles h
    ON h.improvement_area_id = i.area_id
   AND h.is_current
   AND lower(btrim(h.role_type)) = 'department_owner'
  LEFT JOIN public.staff s ON s.id = h.staff_id
  JOIN public.profiles pr  ON pr.id = COALESCE(s.profile_id, h.profile_id)
 WHERE i.status = 'under_review'
    OR (i.status IN ('approved', 'applied')
        AND NOT EXISTS (SELECT 1 FROM public.improvement_idea_assignees a WHERE a.idea_id = i.id))
ON CONFLICT (idea_id, profile_id) DO NOTHING;

-- Under Review on a department with no owner -> the CEO, so it is with somebody.
INSERT INTO public.improvement_idea_assignees (idea_id, profile_id, assignee_name)
SELECT i.id, pr.id, COALESCE(NULLIF(btrim(pr.full_name), ''), pr.email, 'Unnamed')
  FROM public.improvement_ideas i
  JOIN public.profiles pr ON pr.id = public.fn_improvement_new_idea_assignee()
 WHERE i.status = 'under_review'
   AND NOT EXISTS (SELECT 1 FROM public.improvement_idea_assignees a WHERE a.idea_id = i.id)
ON CONFLICT (idea_id, profile_id) DO NOTHING;

DO $assert$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_improvement_assignees_apply(uuid, uuid[], uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can EXECUTE fn_improvement_assignees_apply — anyone could assign any idea to anyone';
  END IF;

  IF has_function_privilege('anon', 'public.fn_improvement_set_assignees(uuid, uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_improvement_set_status(uuid, public.improvement_idea_status, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE an improvement RPC — the anon lock failed';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_improvement_set_assignees(uuid, uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_improvement_set_status(uuid, public.improvement_idea_status, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE an improvement RPC it needs';
  END IF;

  IF NOT has_function_privilege('anon', 'public.fn_improvement_my_assigned_idea_ids()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon cannot EXECUTE fn_improvement_my_assigned_idea_ids — an anon read of improvement_ideas would raise';
  END IF;

  IF position('fn_improvement_my_assigned_idea_ids' IN (
       SELECT qual FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'improvement_ideas'
          AND policyname = 'improvement_ideas_select')) = 0 THEN
    RAISE EXCEPTION 'improvement_ideas_select has no assignee branch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.improvement_ideas'::regclass
       AND tgname = 'trg_improvement_ideas_assign_on_insert'
  ) THEN
    RAISE EXCEPTION 'the new-idea assignment trigger was not created';
  END IF;
END $assert$;

COMMIT;

NOTIFY pgrst, 'reload schema';
