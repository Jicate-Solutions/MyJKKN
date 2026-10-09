-- ============================================================================
-- Improvement Board · a new department owner takes the ideas under review
-- Created: 2026-10-08
-- Requires: 20271007090000 (improvement_idea_assignees), applied 2026-10-07.
-- ----------------------------------------------------------------------------
-- THE GAP
--   An idea is handed to its department's owners at the moment it MOVES INTO
--   Under Review. An owner named after that moment got nothing: measured on
--   production 2026-10-08, BOOBALAN A (COE / Academic, named 08 Oct) held 0 of
--   that department's 23 ideas under review, and MUTHAZHAHAN D (CDC /
--   Placement, named 07 Oct) 0 of 3.
--
-- WHAT CHANGES
--   1. fn_improvement_owner_join_under_review — internal. Adds ONE person to
--      every idea under review in ONE department, without touching whoever is
--      already on those ideas. One timeline row per idea; ONE bell notification
--      for the lot, not one per idea.
--   2. fn_improvement_department_owner_add calls it the moment an owner is
--      named — a first owner or an additional one. Naming an owner can never
--      fail because of it. A typed-in owner has no account and joins nothing.
--   3. fn_improvement_set_assignees: a department owner may now edit the list
--      while the idea is UNDER REVIEW too (was: approved / applied only), so an
--      owner who is not needed on an idea can be taken off it by hand.
--   4. Catch-up for the owners named between 20271007090000 and this file.
--
-- NOT CHANGED: removing an owner from a department does not take them off the
-- ideas they already hold. That is done per idea, by hand.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. One person joins every idea under review in one department.
--
--    The second writer of improvement_idea_assignees, deliberately separate
--    from fn_improvement_assignees_apply: that one REPLACES an idea's list and
--    notifies per idea, which here would mean reading and rewriting each list
--    and ringing the new owner's bell once per idea.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_owner_join_under_review(
  p_area_id    uuid,
  p_profile_id uuid,
  p_actor      uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name  text;
  v_label text;
  v_ideas uuid[];
  v_count integer;
  v_nid   uuid;
BEGIN
  SELECT COALESCE(NULLIF(btrim(pr.full_name), ''), NULLIF(btrim(pr.email), ''), 'Unnamed')
    INTO v_name
    FROM public.profiles pr WHERE pr.id = p_profile_id;
  IF v_name IS NULL THEN
    RETURN 0;
  END IF;

  SELECT a.label INTO v_label FROM public.improvement_areas a WHERE a.id = p_area_id;

  WITH ins AS (
    INSERT INTO public.improvement_idea_assignees (idea_id, profile_id, assignee_name, assigned_by)
    SELECT i.id, p_profile_id, v_name, p_actor
      FROM public.improvement_ideas i
     WHERE i.area_id = p_area_id
       AND i.status = 'under_review'
    ON CONFLICT (idea_id, profile_id) DO NOTHING
    RETURNING idea_id
  )
  SELECT array_agg(idea_id) INTO v_ideas FROM ins;

  v_count := COALESCE(array_length(v_ideas, 1), 0);
  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, note)
  SELECT t.id, p_actor, 'assigned',
         'Also assigned to ' || v_name || ' — now an owner of '
           || COALESCE(v_label, 'the department') || '.'
    FROM unnest(v_ideas) AS t(id);

  -- One notice for all of them. Never allowed to undo the assignment.
  IF p_profile_id IS DISTINCT FROM p_actor THEN
    BEGIN
      INSERT INTO public.notifications
        (title, body, category, kind, targeting, url, priority, created_by, metadata)
      VALUES (
        v_count::text || CASE WHEN v_count = 1 THEN ' improvement idea is' ELSE ' improvement ideas are' END
          || ' now with you',
        'You are now an owner of ' || COALESCE(v_label, 'a department') || '. '
          || v_count::text || CASE WHEN v_count = 1 THEN ' idea' ELSE ' ideas' END
          || ' under review there '
          || CASE WHEN v_count = 1 THEN 'has' ELSE 'have' END
          || ' been assigned to you. Open the Improvement Board to see them.',
        'improvement:assignment',
        'work_item',
        jsonb_build_object('type', 'user', 'user_ids', to_jsonb(ARRAY[p_profile_id])),
        '/improvement-board',
        'normal',
        COALESCE(p_actor, p_profile_id),
        jsonb_build_object('source', 'improvement.owner_joined', 'area_id', p_area_id, 'ideas', v_count)
      )
      RETURNING id INTO v_nid;

      INSERT INTO public.user_notifications (notification_id, user_id)
      VALUES (v_nid, p_profile_id)
      ON CONFLICT (notification_id, user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN v_count;
END;
$function$;

-- Internal: reached only from fn_improvement_department_owner_add.
REVOKE EXECUTE ON FUNCTION public.fn_improvement_owner_join_under_review(uuid, uuid, uuid) FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_improvement_owner_join_under_review(uuid, uuid, uuid) IS
  'INTERNAL. Adds one person to every idea under review in one improvement area, leaving the existing assignees in place. One timeline row per idea, one notification in total. Called when a department owner is named. Not executable by API roles.';

-- ----------------------------------------------------------------------------
-- 2. Naming an owner. Carried forward verbatim from 20271006100000; the only
--    addition is the block after the INSERT.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_department_owner_add(
  p_area_id     uuid,
  p_staff_id    uuid DEFAULT NULL::uuid,
  p_holder_note text DEFAULT NULL::text,
  p_profile_id  uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id      uuid;
  v_note    text;
  v_staff   uuid := p_staff_id;
  v_profile uuid := NULL;
  v_account uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_improvement_department_owner_add: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.user_has_permission('improvement.area_role.assign')
  ) THEN
    RAISE EXCEPTION 'fn_improvement_department_owner_add: requires improvement.area_role.assign (CEO / CAO / EAO)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'fn_improvement_department_owner_add: no such improvement_area %', p_area_id;
  END IF;
  IF v_staff IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_staff) THEN
    RAISE EXCEPTION 'fn_improvement_department_owner_add: no such team member %', v_staff;
  END IF;

  -- A user account was picked. If that person has a team member record after
  -- all, link through it — one person must not be nameable twice on a
  -- department, once per kind of link.
  IF v_staff IS NULL AND p_profile_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_profile_id) THEN
      RAISE EXCEPTION 'fn_improvement_department_owner_add: no such user account %', p_profile_id;
    END IF;
    SELECT s.id INTO v_staff
      FROM public.staff s
     WHERE s.profile_id = p_profile_id
     ORDER BY COALESCE(s.is_active, false) DESC
     LIMIT 1;
    IF v_staff IS NULL THEN
      v_profile := p_profile_id;
    END IF;
  END IF;

  -- Same convention as the organogram path: a name is stored in notes ONLY
  -- when no team member record is linked. For an account-only owner it is the
  -- account's own name, never what the caller typed.
  IF v_staff IS NOT NULL THEN
    v_note := NULL;
  ELSIF v_profile IS NOT NULL THEN
    SELECT NULLIF(btrim(COALESCE(NULLIF(btrim(p.full_name), ''), p.email, '')), '')
      INTO v_note
      FROM public.profiles p WHERE p.id = v_profile;
    v_note := COALESCE(v_note, 'Unnamed account');
  ELSE
    v_note := NULLIF(btrim(COALESCE(p_holder_note, '')), '');
  END IF;

  IF v_staff IS NULL AND v_note IS NULL THEN
    RAISE EXCEPTION 'fn_improvement_department_owner_add: an owner is required';
  END IF;
  IF v_staff IS NULL AND v_note ~ '^\[.*\]$' THEN
    RAISE EXCEPTION 'fn_improvement_department_owner_add: "%" is a placeholder, not a person - pick a team member or type a real name', v_note;
  END IF;

  -- Already an owner here: nothing to add.
  SELECT h.id INTO v_id
    FROM public.hr_additional_roles h
   WHERE h.improvement_area_id = p_area_id
     AND h.is_current
     AND lower(btrim(h.role_type)) = 'department_owner'
     AND (
       (v_staff IS NOT NULL AND h.staff_id = v_staff)
       OR (v_profile IS NOT NULL AND h.profile_id = v_profile)
       OR (v_staff IS NULL AND v_profile IS NULL
           AND h.staff_id IS NULL AND h.profile_id IS NULL
           AND lower(btrim(h.notes)) = lower(v_note))
     )
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.hr_additional_roles (
    improvement_area_id, hr_organization_id, role_type, role_category,
    staff_id, hr_employee_id, profile_id, notes,
    start_date, end_date, is_current, assigned_by
  ) VALUES (
    p_area_id, NULL, 'department_owner', 'Department Playbook',
    v_staff, NULL, v_profile, v_note,
    CURRENT_DATE, NULL, true, auth.uid()
  )
  RETURNING id INTO v_id;

  -- A new owner takes the department's ideas that are under review, straight
  -- away. Needs a user account, so a typed-in owner joins nothing. Naming the
  -- owner must never fail because of this.
  BEGIN
    IF v_staff IS NOT NULL THEN
      SELECT s.profile_id INTO v_account FROM public.staff s WHERE s.id = v_staff;
    ELSE
      v_account := v_profile;
    END IF;
    IF v_account IS NOT NULL THEN
      PERFORM public.fn_improvement_owner_join_under_review(p_area_id, v_account, auth.uid());
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_department_owner_add(uuid, uuid, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_department_owner_add(uuid, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_improvement_department_owner_add(uuid, uuid, text, uuid) IS
  'Adds ONE department_owner to an improvement area without ending any other owner. Officer-only: improvement.area_role.assign or super admin. Links a team member record (staff_id), or a user account with no team member record (profile_id), or stores a typed name. Naming someone who already owns the area returns their existing row. A newly named owner who has a user account is added to every idea under review in that area.';

-- ----------------------------------------------------------------------------
-- 3. The manual pick. Verbatim from 20271007090000 except the status list: an
--    owner may now edit the list while the idea is under review as well.
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
    IF v_status NOT IN ('under_review', 'approved', 'applied') THEN
      RAISE EXCEPTION 'People are assigned once the idea is under review.';
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
  'Sets the people an improvement idea is assigned to (replaces the current list; an empty list clears it). A board manager may do this at any stage; the owner of the idea''s department while it is under review, approved or applied.';

-- ----------------------------------------------------------------------------
-- 4. Catch-up: owners named since 20271007090000 join their department's
--    ideas under review. Direct insert — no timeline row and no notification
--    for a gap that was the system's, not theirs. Every owner named before
--    that migration already holds all of theirs (verified 2026-10-08), so this
--    re-adds nobody who was deliberately taken off.
-- ----------------------------------------------------------------------------
INSERT INTO public.improvement_idea_assignees (idea_id, profile_id, assignee_name)
SELECT DISTINCT i.id, pr.id,
       COALESCE(NULLIF(btrim(pr.full_name), ''), NULLIF(btrim(pr.email), ''), 'Unnamed')
  FROM public.improvement_ideas i
  JOIN public.hr_additional_roles h
    ON h.improvement_area_id = i.area_id
   AND h.is_current
   AND lower(btrim(h.role_type)) = 'department_owner'
  LEFT JOIN public.staff s ON s.id = h.staff_id
  JOIN public.profiles pr  ON pr.id = COALESCE(s.profile_id, h.profile_id)
 WHERE i.status = 'under_review'
ON CONFLICT (idea_id, profile_id) DO NOTHING;

DO $assert$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_improvement_owner_join_under_review(uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can EXECUTE fn_improvement_owner_join_under_review — anyone could put anyone on a department''s ideas';
  END IF;

  IF has_function_privilege('anon', 'public.fn_improvement_department_owner_add(uuid, uuid, text, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_improvement_set_assignees(uuid, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE an improvement RPC — the anon lock failed';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_improvement_department_owner_add(uuid, uuid, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_improvement_set_assignees(uuid, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE an improvement RPC it needs';
  END IF;

  IF position('fn_improvement_owner_join_under_review' IN pg_get_functiondef(
       'public.fn_improvement_department_owner_add(uuid, uuid, text, uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'naming an owner does not hand them the ideas under review';
  END IF;
END $assert$;

COMMIT;

NOTIFY pgrst, 'reload schema';
