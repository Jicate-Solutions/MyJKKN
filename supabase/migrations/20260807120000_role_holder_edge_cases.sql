-- Migration: three edge cases in department role holders, decided 2026-07-29
-- Created: 2026-07-29
--
-- 1) DELETING A BOARD silently un-assigned everyone holding a role on it. The delete
--    guard counts eight dependent tables, but holders arrived in hr_additional_roles in
--    a LATER migration, and that FK cascades — so the guard had a hole it could not see.
--    It now counts current holders and refuses, exactly as it does for playbooks.
--
-- 2) WHEN A TEAM MEMBER LEAVES, their staff row may be deleted and the FK cascade took
--    the assignment with it — the organogram simply showed an empty role and no record
--    that anyone had held it. The row is now KEPT and retired: staff_id becomes NULL,
--    the person's name is snapshotted first, and the row is end-dated. History survives.
--
-- 3) RE-DRAFTING renames roles, and approving that draft quietly ended assignments under
--    the old names. The officers who can re-assign are now told which holders were
--    dropped and why. Best-effort — a notification failure never undoes the sync.
-- ============================================================================

-- 2a) Snapshot column so a retired assignment still says WHO held the role.
ALTER TABLE public.hr_additional_roles
  ADD COLUMN IF NOT EXISTS holder_display_name text;

COMMENT ON COLUMN public.hr_additional_roles.holder_display_name IS
  'Name of the holder captured when the assignment is retired, so history stays readable after their staff record is removed.';

-- 2b) The FK must stop destroying the row. SET NULL keeps the assignment; the trigger
--     below captures the name and end-dates it before the cascade nulls the column.
ALTER TABLE public.hr_additional_roles
  DROP CONSTRAINT IF EXISTS hr_additional_roles_staff_id_fkey;

ALTER TABLE public.hr_additional_roles
  ADD CONSTRAINT hr_additional_roles_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

-- 2c) BEFORE DELETE on staff fires ahead of the FK action, so this is the last moment
--     the person's name is still resolvable.
CREATE OR REPLACE FUNCTION public.fn_hr_add_roles_retire_on_staff_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.hr_additional_roles r
  SET holder_display_name = COALESCE(
        r.holder_display_name,
        NULLIF(btrim(COALESCE(OLD.first_name, '') || ' ' || COALESCE(OLD.last_name, '')), ''),
        (SELECT p.full_name FROM public.profiles p WHERE p.id = OLD.profile_id)
      ),
      is_current = false,
      end_date   = COALESCE(r.end_date, CURRENT_DATE),
      updated_at = now()
  WHERE r.staff_id = OLD.id
    AND r.improvement_area_id IS NOT NULL
    AND r.is_current;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_add_roles_retire_on_staff_delete() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_hr_add_roles_retire_on_staff_delete ON public.staff;
CREATE TRIGGER trg_hr_add_roles_retire_on_staff_delete
  BEFORE DELETE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_add_roles_retire_on_staff_delete();

-- 1) + 3) The two functions below are the LIVE definitions with only the additions
--         described above; every existing guard and message is unchanged.
CREATE OR REPLACE FUNCTION public.fn_improvement_area_delete(p_area_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_label       text;
  v_is_system   boolean;
  v_ideas       bigint;
  v_artifacts   bigint;
  v_versions    bigint;
  v_gaps        bigint;
  v_postings    bigint;
  v_views       bigint;
  v_slots       bigint;
  v_cycle_depts bigint;
  v_holders     bigint;
  v_parts       text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.fn_improvement_can_manage_areas() THEN
    RAISE EXCEPTION 'You do not have permission to delete improvement boards.';
  END IF;
  IF p_area_id IS NULL THEN
    RAISE EXCEPTION 'A board is required.';
  END IF;

  SELECT a.label, a.is_system INTO v_label, v_is_system
  FROM public.improvement_areas a WHERE a.id = p_area_id;

  IF v_label IS NULL THEN
    RAISE EXCEPTION 'That board no longer exists. Refresh and try again.';
  END IF;

  IF v_is_system THEN
    RAISE EXCEPTION 'The built-in board "%" cannot be deleted. Switch it off instead — deactivating hides it everywhere and can be undone.', v_label;
  END IF;

  SELECT
    (SELECT count(*) FROM public.improvement_ideas              x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_dept_artifacts             x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_dept_artifact_versions     x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_data_gaps                  x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_associate_postings         x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_area_analyst_views         x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_rotation_slots             x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_rotation_cycle_departments x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.hr_additional_roles           x WHERE x.improvement_area_id = p_area_id AND x.is_current)
  INTO v_ideas, v_artifacts, v_versions, v_gaps, v_postings, v_views, v_slots, v_cycle_depts, v_holders;

  IF v_ideas       > 0 THEN v_parts := v_parts || (v_ideas       || ' improvement idea(s)'); END IF;
  IF v_artifacts   > 0 THEN v_parts := v_parts || (v_artifacts   || ' department playbook(s)'); END IF;
  IF v_versions    > 0 THEN v_parts := v_parts || (v_versions    || ' playbook version(s)'); END IF;
  IF v_gaps        > 0 THEN v_parts := v_parts || (v_gaps        || ' data gap(s)'); END IF;
  IF v_postings    > 0 THEN v_parts := v_parts || (v_postings    || ' analyst assignment(s)'); END IF;
  IF v_views       > 0 THEN v_parts := v_parts || (v_views       || ' analyst view(s)'); END IF;
  IF v_slots       > 0 THEN v_parts := v_parts || (v_slots       || ' rotation slot(s)'); END IF;
  IF v_cycle_depts > 0 THEN v_parts := v_parts || (v_cycle_depts || ' rotation cycle entr(ies)'); END IF;

  IF v_holders     > 0 THEN v_parts := v_parts || (v_holders     || ' assigned role holder(s)'); END IF;

  IF array_length(v_parts, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'The board "%" still has % attached to it, and deleting it would destroy that work. Switch the board off instead — deactivating hides it from every picker and can be undone.',
      v_label, array_to_string(v_parts, ', ');
  END IF;

  DELETE FROM public.improvement_areas a WHERE a.id = p_area_id;
END $function$;

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
      SELECT array_agg(u) INTO v_recips FROM (
        SELECT u FROM public.tms_users_with_permission('improvement.area_role.assign') u LIMIT 50
      ) s;
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

REVOKE EXECUTE ON FUNCTION public.fn_improvement_area_delete(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_area_delete(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_role_assignments_sync(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_role_assignments_sync(uuid, jsonb) TO authenticated;
