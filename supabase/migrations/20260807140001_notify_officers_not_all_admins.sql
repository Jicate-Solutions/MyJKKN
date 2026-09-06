-- Migration: the un-assigned-holder notice goes to the OFFICES, not every super admin
-- Created: 2026-07-29
-- fn_mba_dept_role_assignments_sync resolved recipients with tms_users_with_permission,
-- which by design also returns every super admin — 14 of them against 5 real officers,
-- so a dropped role pinged 19 people. This platform already carries ~170k unread
-- notifications from over-broad fan-out. Notify the offices that hold the permission
-- through a role; fall back to the wide resolver only if none do.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mba_dept_role_assignments_sync(p_area_id uuid, p_assignments jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row   jsonb;
  v_role  text;
  v_note  text;
  v_sid   uuid;
  v_keep  text[] := ARRAY[]::text[];
  v_kept  integer := 0;
  v_dropped_n     integer := 0;
  v_dropped_roles text[];
  v_recips        uuid[];
  v_notif         uuid;
  v_area_label    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignments_sync: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.user_has_permission('improvement.area_role.assign')
  ) THEN
    RETURN 0;  -- caller may approve playbooks but not assign holders; sync is a no-op for them
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignments_sync: no such improvement_area %', p_area_id;
  END IF;
  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignments_sync: p_assignments must be a jsonb array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    v_role := btrim(COALESCE(v_row->>'role_type', ''));
    v_note := NULLIF(btrim(COALESCE(v_row->>'holder_note', '')), '');
    BEGIN
      v_sid := NULLIF(btrim(COALESCE(v_row->>'staff_id', '')), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_sid := NULL;
    END;

    CONTINUE WHEN v_role = '';
    -- A team member who no longer exists cannot be linked; keep any typed name.
    IF v_sid IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_sid) THEN
      v_sid := NULL;
    END IF;
    -- Nobody named yet for this role — nothing to remember.
    CONTINUE WHEN v_sid IS NULL AND v_note IS NULL;
    -- A duplicated role title in the same organogram: first entry wins.
    CONTINUE WHEN lower(v_role) = ANY (v_keep);

    v_keep := v_keep || lower(v_role);
    v_kept := v_kept + 1;
    PERFORM public.fn_mba_dept_role_assignment_set(p_area_id, v_role, v_sid, v_note);
  END LOOP;

  -- End assignments for roles the organogram no longer carries (or that were
  -- cleared back to "nobody yet"). History rows are untouched.
  WITH dropped AS (
    UPDATE public.hr_additional_roles
    SET is_current = false, end_date = CURRENT_DATE, updated_at = now()
    WHERE improvement_area_id = p_area_id
      AND is_current
      AND NOT (lower(btrim(role_type)) = ANY (v_keep))
    RETURNING role_type
  )
  SELECT count(*), array_agg(role_type) INTO v_dropped_n, v_dropped_roles FROM dropped;

  -- Someone stops holding a role here without ever being told, so tell the people
  -- who can re-assign. Best-effort: a notification failure must never undo a sync.
  IF COALESCE(v_dropped_n, 0) > 0 THEN
    BEGIN
      -- The people who can actually re-assign: the offices holding the permission via
      -- a ROLE. tms_users_with_permission also returns every super admin (14 of them
      -- here vs 5 officers), and this codebase already carries ~170k unread
      -- notifications from over-broad fan-out. Fall back to the wide resolver only if
      -- no office currently holds the permission, so the message is never lost.
      SELECT array_agg(u) INTO v_recips FROM (
        SELECT DISTINCT ur.user_id AS u
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE cr.permissions ? 'improvement.area_role.assign'
          AND COALESCE(cr.is_active, true)
        LIMIT 50
      ) s;
      IF v_recips IS NULL OR array_length(v_recips, 1) = 0 THEN
        SELECT array_agg(u) INTO v_recips FROM (
          SELECT u FROM public.tms_users_with_permission('improvement.area_role.assign') u LIMIT 50
        ) s;
      END IF;
      IF v_recips IS NOT NULL AND array_length(v_recips, 1) > 0 THEN
        SELECT label INTO v_area_label FROM public.improvement_areas WHERE id = p_area_id;
        INSERT INTO public.notifications (title, body, category, targeting, url, priority, created_by)
        VALUES (
          'Role holders un-assigned - ' || COALESCE(v_area_label, 'department'),
          v_dropped_n || ' role holder(s) are no longer assigned because the approved playbook '
            || 'no longer carries these roles: ' || array_to_string(v_dropped_roles, ', ')
            || '. If a role was renamed, assign the holder again under the new name.',
          'improvement:playbook',
          jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_recips)),
          '/improvement-board/analytics', 'normal', auth.uid()
        )
        RETURNING id INTO v_notif;
        INSERT INTO public.user_notifications (notification_id, user_id)
        SELECT v_notif, unnest(v_recips);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN v_kept;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_role_assignments_sync(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_role_assignments_sync(uuid, jsonb) TO authenticated;
