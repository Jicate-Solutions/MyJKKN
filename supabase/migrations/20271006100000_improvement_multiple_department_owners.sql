-- ============================================================================
-- Improvement Board · a department can have MORE THAN ONE owner
-- Created: 2026-10-06
-- ----------------------------------------------------------------------------
-- WHAT CHANGES
--   /improvement-board/owners named exactly one department_owner per area. The
--   limit was structural: uq_hr_add_roles_area_role_current allows one CURRENT
--   row per (area, role_type), and fn_mba_dept_role_assignment_set treats a
--   second name as a handover that end-dates the first.
--
--   1. The one-per-role index now excludes role_type = 'department_owner'.
--      Every organogram title keeps its one-holder rule exactly as before.
--   2. Two narrower indexes stop the SAME person being named twice on one
--      department — one per kind of link (team member record, user account).
--   3. hr_additional_roles.profile_id — an owner can be a USER ACCOUNT that has
--      no team member record. 70 active non-learner accounts have none
--      (measured 2026-10-06), so the picker could not find them and they could
--      only be typed in as text — which nothing can notify or show ideas to.
--      Such a row carries profile_id AND the name in `notes`, so the existing
--      subject CHECK holds and a deleted account degrades to a typed-in name
--      instead of blocking the delete.
--   4. fn_improvement_department_owner_add    adds one owner, ends nobody.
--      fn_improvement_department_owner_remove ends ONE owner row by id.
--
-- WHAT IS DELIBERATELY UNTOUCHED
--   * fn_mba_dept_role_assignment_set / _clear / _sync — the organogram path.
--     The owners screen no longer calls `set` or `clear`.
--   * fn_improvement_untriaged_notify already notifies every current holder of
--     an area who has a team member record, so each such co-owner is told
--     without any change here. It resolves people through staff only, so an
--     account-only owner (profile_id, no staff row) is NOT in that nightly
--     notice yet. Same for the gemba "self-recorded" marker.
--   * Approval routing lives in 20271006110000.
--
-- Guards are the same officer rule as the organogram RPCs:
--   improvement.area_role.assign (CEO / CAO / EAO) or super admin.
-- ============================================================================

BEGIN;

ALTER TABLE public.hr_additional_roles
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hr_additional_roles.profile_id IS
  'User account of a department_owner who has NO team member record (staff_id NULL). The name is also kept in notes. Set only by fn_improvement_department_owner_add; a holder with a team member record is linked through staff_id instead.';

DROP INDEX IF EXISTS public.uq_hr_add_roles_area_role_current;

CREATE UNIQUE INDEX uq_hr_add_roles_area_role_current
  ON public.hr_additional_roles (improvement_area_id, lower(btrim(role_type)))
  WHERE improvement_area_id IS NOT NULL
    AND is_current
    AND lower(btrim(role_type)) <> 'department_owner';

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_add_roles_area_owner_staff_current
  ON public.hr_additional_roles (improvement_area_id, staff_id)
  WHERE improvement_area_id IS NOT NULL
    AND is_current
    AND staff_id IS NOT NULL
    AND lower(btrim(role_type)) = 'department_owner';

-- An earlier cut of this migration (applied to production on 2026-10-06) made
-- typed-in names unique per department and had a 3-argument add function.
-- Both go: an account-only owner also keeps their name in `notes`, so that
-- index would refuse two different accounts that share a name, and a second
-- overload makes PostgREST unable to choose between them (PGRST203).
DROP INDEX IF EXISTS public.uq_hr_add_roles_area_owner_typed_current;
DROP FUNCTION IF EXISTS public.fn_improvement_department_owner_add(uuid, uuid, text);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_add_roles_area_owner_profile_current
  ON public.hr_additional_roles (improvement_area_id, profile_id)
  WHERE improvement_area_id IS NOT NULL
    AND is_current
    AND profile_id IS NOT NULL
    AND lower(btrim(role_type)) = 'department_owner';

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

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_improvement_department_owner_remove(
  p_assignment_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_improvement_department_owner_remove: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.user_has_permission('improvement.area_role.assign')
  ) THEN
    RAISE EXCEPTION 'fn_improvement_department_owner_remove: requires improvement.area_role.assign (CEO / CAO / EAO)';
  END IF;

  -- End-dated, never deleted. Scoped to department_owner rows so this cannot be
  -- pointed at an organogram role or an HR-organisation role.
  UPDATE public.hr_additional_roles
     SET is_current = false, end_date = CURRENT_DATE, updated_at = now()
   WHERE id = p_assignment_id
     AND improvement_area_id IS NOT NULL
     AND lower(btrim(role_type)) = 'department_owner'
     AND is_current;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_department_owner_add(uuid, uuid, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_department_owner_add(uuid, uuid, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_improvement_department_owner_remove(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_department_owner_remove(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_improvement_department_owner_add(uuid, uuid, text, uuid) IS
  'Adds ONE department_owner to an improvement area without ending any other owner (a department may have several since 2026-10-06). Officer-only: improvement.area_role.assign or super admin. Links a team member record (staff_id), or a user account with no team member record (profile_id), or stores a typed name. Naming someone who already owns the area returns their existing row.';
COMMENT ON FUNCTION public.fn_improvement_department_owner_remove(uuid) IS
  'Ends ONE current department_owner row by id (end-dated, never deleted). Officer-only: improvement.area_role.assign or super admin. Returns how many rows were ended (0 or 1).';

DO $assert$
BEGIN
  IF has_function_privilege('anon', 'public.fn_improvement_department_owner_add(uuid, uuid, text, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_improvement_department_owner_remove(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE a department owner RPC — the anon lock failed';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_improvement_department_owner_add(uuid, uuid, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_improvement_department_owner_remove(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE a department owner RPC — nobody could name an owner';
  END IF;

  IF position('department_owner' IN (
       SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'uq_hr_add_roles_area_role_current')) = 0 THEN
    RAISE EXCEPTION 'uq_hr_add_roles_area_role_current still limits department_owner to one per area';
  END IF;
END $assert$;

COMMIT;

NOTIFY pgrst, 'reload schema';
