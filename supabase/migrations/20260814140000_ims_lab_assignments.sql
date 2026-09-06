-- Migration: 20260814140000_ims_lab_assignments
-- Purpose: give IMS its own lab-assistant → department mapping, and stop HR
--          silently destroying the department an admin sets.
--
-- REPORTED: "if I assign the lab assistant role, the assigned lab is updated
-- automatically again and again, so they can't raise an indent request."
--
-- THE CHAIN (every step verified against live before writing this):
--
--  1. An admin assigns the lab_assistant role and sets the person's lab
--     (departments row) on their staff record.
--  2. Saving staff fires validate_staff_department_scope(), which is
--     BEFORE INSERT OR UPDATE OF category_id, department_id, role_key — so it
--     runs on EVERY staff save. That is the "again and again".
--  3. The employment category "Lab Assistant" has is_teaching = false, and the
--     trigger did:
--            IF v_is_teaching = false AND NEW.department_id IS NOT NULL THEN
--                NEW.department_id := NULL;      -- silently, no error
--     so the lab was discarded with no feedback to the admin, who then set it
--     again, and again.
--  4. sync_staff_to_profiles() copies department_id straight through
--     (`department_id = NEW.department_id`), so profiles.department_id became
--     NULL too.
--  5. lab_assistant has module_scopes->>'ims' = 'own_department', so
--     ims_indent_dept_scope_for() treats them as department-scoped, finds no
--     department, and returns the fail-closed sentinel
--     00000000-0000-0000-0000-000000000000 — they see nothing and cannot raise
--     an indent. All 10 lab assistants were in this state.
--
-- THE DESIGN ERROR: is_teaching was being used as a proxy for "belongs to a
-- department". Live data shows how absolute that was — all 538 teaching staff
-- have a department and all 348 non-teaching staff have none, including 20
-- Lab Assistant / Lab Technician / Lab Instructor staff who plainly work in one.
--
-- THE FIX (user's decision): HR's rule is left exactly as it is — non-teaching
-- staff still carry no department, so nothing changes for the other 328. IMS
-- instead owns the lab a lab assistant works in, in its own table. HR data and
-- IMS scoping stop fighting over one column.
--
-- The silent NULL is also removed. Discarding an admin's input without telling
-- them is what made this invisible and repeatable; setting a department that the
-- category does not allow is now a clear error that names where the lab belongs.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. The mapping table
--    Shape and RLS mirror ims_user_store_grants deliberately — it is the same
--    kind of object (an admin-granted IMS scope attached to a user), so it should
--    not invent a second convention.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ims_lab_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES public.departments(id),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    notes         TEXT,
    assigned_by   UUID REFERENCES public.profiles(id),
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ims_indent_dept_scope_for returns ONE department, so a user may hold at most
-- one ACTIVE lab. Enforced here rather than trusted to the UI, otherwise the
-- scope function would be silently picking a winner between rows.
CREATE UNIQUE INDEX IF NOT EXISTS ims_lab_assignments_one_active_per_user
    ON public.ims_lab_assignments (user_id)
    WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_ims_lab_assignments_user
    ON public.ims_lab_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_ims_lab_assignments_department
    ON public.ims_lab_assignments (department_id);

ALTER TABLE public.ims_lab_assignments ENABLE ROW LEVEL SECURITY;

-- A user must be able to read their OWN assignment: the client hook resolves the
-- scope through the SECURITY DEFINER function, but the admin screens read the
-- table directly. Writes are super_admin only, exactly as store grants are.
DROP POLICY IF EXISTS ims_lab_assignments_select ON public.ims_lab_assignments;
CREATE POLICY ims_lab_assignments_select ON public.ims_lab_assignments
    FOR SELECT TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR (SELECT public.get_current_user_role()) = 'super_admin'
    );

DROP POLICY IF EXISTS ims_lab_assignments_insert ON public.ims_lab_assignments;
CREATE POLICY ims_lab_assignments_insert ON public.ims_lab_assignments
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.get_current_user_role()) = 'super_admin');

DROP POLICY IF EXISTS ims_lab_assignments_update ON public.ims_lab_assignments;
CREATE POLICY ims_lab_assignments_update ON public.ims_lab_assignments
    FOR UPDATE TO authenticated
    USING ((SELECT public.get_current_user_role()) = 'super_admin');

DROP POLICY IF EXISTS ims_lab_assignments_delete ON public.ims_lab_assignments;
CREATE POLICY ims_lab_assignments_delete ON public.ims_lab_assignments
    FOR DELETE TO authenticated
    USING ((SELECT public.get_current_user_role()) = 'super_admin');

-- anon must never see or touch a staff-to-department map.
REVOKE ALL ON TABLE public.ims_lab_assignments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ims_lab_assignments TO authenticated;

COMMENT ON TABLE public.ims_lab_assignments IS
'Which department (lab) a department-scoped IMS user works in. Exists because HR keeps department_id NULL for non-teaching staff (validate_staff_department_scope), which left lab assistants with no department and therefore unable to raise indents. Read by ims_indent_dept_scope_for() in preference to profiles.department_id.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Teach the scope resolver to read the mapping
--    Only the SOURCE of the department changes. Every other branch — super admin
--    unrestricted, a broader ims role unrestricted, no scoped role unrestricted,
--    and the fail-closed sentinel — is preserved exactly, so nobody else's
--    visibility moves.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ims_indent_dept_scope_for(p_uid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_priv boolean;
  v_has_broader boolean;
  v_has_scoped boolean;
  v_dept uuid;
BEGIN
  IF p_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT (p.is_super_admin = true
          OR p.role IN ('super_admin', 'admin', 'administrator'))
    INTO v_priv
  FROM profiles p WHERE p.id = p_uid;

  IF COALESCE(v_priv, false) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT cr.permissions, cr.module_scopes
      FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p_uid
      UNION
      SELECT cr.permissions, cr.module_scopes
      FROM profiles p JOIN custom_roles cr ON cr.role_key = p.role
      WHERE p.id = p_uid
    ) r
    WHERE (r.permissions->>'ims.view')::boolean = true
      AND COALESCE(r.module_scopes->>'ims', '') <> 'own_department'
  ) INTO v_has_broader;

  IF v_has_broader THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT cr.permissions, cr.module_scopes
      FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p_uid
      UNION
      SELECT cr.permissions, cr.module_scopes
      FROM profiles p JOIN custom_roles cr ON cr.role_key = p.role
      WHERE p.id = p_uid
    ) r
    WHERE (r.permissions->>'ims.view')::boolean = true
      AND r.module_scopes->>'ims' = 'own_department'
  ) INTO v_has_scoped;

  IF NOT v_has_scoped THEN
    RETURN NULL;
  END IF;

  -- IMS's own mapping wins. Lab assistants are non-teaching staff, so HR holds
  -- no department for them and profiles.department_id is NULL by design.
  SELECT la.department_id INTO v_dept
    FROM ims_lab_assignments la
   WHERE la.user_id = p_uid
     AND la.is_active
   LIMIT 1;

  -- Fall back to the HR department so department-scoped TEACHING staff keep
  -- working exactly as before without needing a row in the new table.
  IF v_dept IS NULL THEN
    SELECT p.department_id INTO v_dept FROM profiles p WHERE p.id = p_uid;
  END IF;

  RETURN COALESCE(v_dept, '00000000-0000-0000-0000-000000000000'::uuid);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Stop the silent data loss in HR
--    The rule itself is unchanged — non-teaching staff still carry no department.
--    What changes is that refusing is now VISIBLE. Silently nulling the value an
--    admin just typed is why this bug survived: the UI reported success, the lab
--    was gone, and the only symptom appeared much later in a different module.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_staff_department_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_is_teaching BOOLEAN;
    v_category    TEXT;
BEGIN
    SELECT is_teaching, category_name INTO v_is_teaching, v_category
    FROM employment_categories
    WHERE id = NEW.category_id;

    IF v_is_teaching IS NULL THEN
        RAISE EXCEPTION 'Invalid category_id %: employment category not found', NEW.category_id
            USING ERRCODE = '23503';
    END IF;

    IF v_is_teaching = true AND NEW.department_id IS NULL THEN
        RAISE EXCEPTION 'department_id is required for teaching staff (category.is_teaching=true)'
            USING ERRCODE = '23514';
    END IF;

    IF v_is_teaching = false AND NEW.department_id IS NOT NULL THEN
        RAISE EXCEPTION
            'Department cannot be set on non-teaching staff (category "%"). If this person is a lab assistant who needs a lab for IMS indents, assign the lab in IMS instead of here — it is stored in ims_lab_assignments.',
            COALESCE(v_category, 'unknown')
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;
