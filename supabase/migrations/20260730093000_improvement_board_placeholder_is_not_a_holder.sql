-- 2026-07-30 — Department playbook role holders: an AI placeholder is not a person.
--
-- WHAT WENT WRONG
-- The organogram's AI draft fills every "who holds it" field with the literal
-- text "[Manager to complete]". Nothing rejected it, so approving a first draft
-- wrote those placeholders into hr_additional_roles as real assignments. Eight
-- such rows exist on production right now — all in Feedback / SCF, all
-- staff_id IS NULL, all inserted in one transaction on 2026-07-29 05:19 — and
-- each one asserts a false fact about who runs a department.
--
-- The latent case is worse than the visible one. The review dialog overlays the
-- saved holders over the fresh AI draft; when that overlay fails it currently
-- falls through with the placeholders still on screen. Approving then treats
-- each placeholder as a HANDOVER: fn_mba_dept_role_assignment_set end-dates the
-- genuine assignment and inserts the placeholder in its place. That destroys
-- live institution-wide org data with no error shown to anyone.
--
-- THREE LAYERS, so that no single guard is load-bearing
--   1. Remove the eight false rows.
--   2. A CHECK constraint. The officers who may assign holders also hold a
--      direct INSERT/UPDATE policy on this table, so a raw PostgREST write
--      bypasses the RPC guard entirely. Scoped to improvement-area rows so
--      ordinary HR notes elsewhere may still contain brackets.
--   3. fn_mba_dept_role_assignment_set rejects a placeholder outright, and
--      fn_mba_dept_role_assignments_sync treats one as "leave this role alone".
--      Sync must NOT simply skip it: a skipped role falls out of the keep-list,
--      and the drop sweep would then end-date that role's real holder — the very
--      data loss this migration exists to prevent.
--
-- ALSO FIXED HERE (same function, so one replace instead of two racing ones)
-- The un-assignment notice picked its recipients with `cr.permissions ? 'key'`,
-- which tests whether the key is PRESENT. Role Management stores an unchecked
-- box as the key present with value false, so an explicit "no" read as a yes:
-- hod carries the key with value false and 102 users, giving 107 recipients
-- where 5 were intended. It now tests the VALUE.
--
-- Measured on production before this migration:
--   by existence -> 107 recipients | by value -> 5 | wide resolver -> 19

-- ---------------------------------------------------------------------------
-- 1. The eight false facts. No foreign key references this table, so nothing
--    is orphaned; the table returns to the empty state it held before the bug.
-- ---------------------------------------------------------------------------
DELETE FROM public.hr_additional_roles
WHERE improvement_area_id IS NOT NULL
  AND staff_id IS NULL
  AND btrim(COALESCE(notes, '')) ~ '^\[.*\]$';

-- ---------------------------------------------------------------------------
-- 2. Structural guarantee, reachable even by a raw PostgREST write.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_additional_roles
  DROP CONSTRAINT IF EXISTS hr_additional_roles_holder_not_placeholder;

ALTER TABLE public.hr_additional_roles
  ADD CONSTRAINT hr_additional_roles_holder_not_placeholder
  CHECK (
    improvement_area_id IS NULL
    OR notes IS NULL
    OR btrim(notes) !~ '^\[.*\]$'
  );

COMMENT ON CONSTRAINT hr_additional_roles_holder_not_placeholder
  ON public.hr_additional_roles IS
  'A bracketed value such as "[Manager to complete]" is an AI draft prompt to a human, never a role holder. Improvement-area rows only, so ordinary HR notes may still use brackets.';

-- ---------------------------------------------------------------------------
-- 3a. fn_mba_dept_role_assignment_set — a placeholder is refused outright.
--     This is the single-role officer action, so failing loudly is correct:
--     the officer sees why and picks a real person.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_mba_dept_role_assignment_set(
  p_area_id uuid,
  p_role_type text,
  p_staff_id uuid DEFAULT NULL::uuid,
  p_holder_note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id       uuid;
  v_role     text;
  v_note     text;
  v_cur_id   uuid;
  v_cur_sid  uuid;
  v_cur_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.user_has_permission('improvement.area_role.assign')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: requires improvement.area_role.assign (CEO / CAO / EAO)';
  END IF;

  v_role := btrim(COALESCE(p_role_type, ''));
  v_note := NULLIF(btrim(COALESCE(p_holder_note, '')), '');

  IF v_role = '' THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: role_type is required';
  END IF;
  IF p_staff_id IS NULL AND v_note IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: a holder is required';
  END IF;
  -- The AI draft writes "[Manager to complete]" into every holder field. A
  -- bracketed value is a prompt to a human, so it must never be stored as the
  -- person holding an institution-wide role.
  IF p_staff_id IS NULL AND v_note ~ '^\[.*\]$' THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: "%" is a placeholder, not a person - pick a team member or type a real name', v_note;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: no such improvement_area %', p_area_id;
  END IF;
  IF p_staff_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = p_staff_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: no such team member %', p_staff_id;
  END IF;

  SELECT id, staff_id, notes INTO v_cur_id, v_cur_sid, v_cur_note
  FROM public.hr_additional_roles
  WHERE improvement_area_id = p_area_id
    AND lower(btrim(role_type)) = lower(v_role)
    AND is_current
  FOR UPDATE;

  -- Same holder already standing: refresh the label/name only.
  IF v_cur_id IS NOT NULL
     AND v_cur_sid IS NOT DISTINCT FROM p_staff_id
     AND v_cur_note IS NOT DISTINCT FROM v_note THEN
    UPDATE public.hr_additional_roles
    SET role_type = v_role, updated_at = now()
    WHERE id = v_cur_id;
    RETURN v_cur_id;
  END IF;

  -- Handover: close the standing assignment, then open a new one.
  IF v_cur_id IS NOT NULL THEN
    UPDATE public.hr_additional_roles
    SET is_current = false, end_date = CURRENT_DATE, updated_at = now()
    WHERE id = v_cur_id;
  END IF;

  INSERT INTO public.hr_additional_roles (
    improvement_area_id, hr_organization_id, role_type, role_category,
    staff_id, hr_employee_id, notes,
    start_date, end_date, is_current, assigned_by
  ) VALUES (
    p_area_id, NULL, v_role, 'Department Playbook',
    p_staff_id, NULL, v_note,
    CURRENT_DATE, NULL, true, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_role_assignment_set(uuid, text, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_role_assignment_set(uuid, text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3b. fn_mba_dept_role_assignments_sync — a placeholder means "leave this role
--     alone", and the un-assignment notice tests the permission's VALUE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_mba_dept_role_assignments_sync(
  p_area_id uuid,
  p_assignments jsonb
)
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

    -- "[Manager to complete]" and friends are the AI draft's prompt to a human,
    -- not a holder. Claim the role for the keep-list so the drop sweep below
    -- leaves any REAL holder standing, then write nothing. Skipping instead
    -- would drop the role out of the keep-list and end-date its real holder,
    -- which is exactly the silent data loss this guard exists to stop.
    IF v_sid IS NULL AND v_note IS NOT NULL AND v_note ~ '^\[.*\]$' THEN
      IF NOT (lower(v_role) = ANY (v_keep)) THEN
        v_keep := v_keep || lower(v_role);
      END IF;
      CONTINUE;
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
      --
      -- Test the VALUE, not the key's presence. Role Management writes an unchecked
      -- box as the key present with value false, so `permissions ? 'key'` reads an
      -- explicit "no" as a yes -- it swept in hod (102 users), 107 recipients where
      -- 5 were meant.
      SELECT array_agg(u) INTO v_recips FROM (
        SELECT DISTINCT ur.user_id AS u
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE COALESCE((cr.permissions->>'improvement.area_role.assign')::boolean, false)
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
