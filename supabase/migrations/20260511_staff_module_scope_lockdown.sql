-- 20260511_staff_module_scope_lockdown.sql
-- Activates module_scopes.staff for every custom_role and replaces
-- staff RLS policies with scope-aware versions.
--
-- Three scope buckets:
--   all_institutions -> super_admin, hr_admin (system-wide CRUD)
--   own_institution  -> hod, principal (CRUD scoped to accessible institutions)
--   own_records      -> faculty + every other custom role (one row: staff.profile_id = auth.uid())
--
-- Faculty differentiator: keeps staff.edit=true so they can save edits on their
-- own row. Other own_records roles have staff.edit=false (view-only).
--
-- Functions consumed (signatures verified against prod 2026-05-11):
--   public.get_user_module_scope(module_key text)        -> text
--   public.user_has_permission(permission_name text)     -> boolean
--   public.role_has_institution_access(check_institution_id uuid) -> boolean
--   public.is_super_admin()                              -> boolean
--
-- Rollback: see docs/superpowers/plans/2026-05-11-staff-module-scope-lockdown.md (Task 12)

BEGIN;

-- 1. Safety snapshot - one-way restore source if rollback needed.
DROP TABLE IF EXISTS public._staff_scope_lockdown_backup_20260511;
CREATE TABLE public._staff_scope_lockdown_backup_20260511 AS
SELECT id, role_key, permissions, module_scopes, institution_scope, updated_at
FROM public.custom_roles;

-- Sanity: snapshot must have rows
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public._staff_scope_lockdown_backup_20260511) = 0 THEN
    RAISE EXCEPTION 'Snapshot table is empty - aborting';
  END IF;
END$$;

-- 2. Populate module_scopes.staff for every custom_role.
--    Rule:
--      institution_scope = 'all'  -> 'all_institutions'
--      institution_scope = 'own'  -> if role currently has staff.view=true -> 'own_institution'
--                                    else                                  -> 'own_records'
--      anything else / unknown    -> 'own_records' (fail-closed default)
UPDATE public.custom_roles cr
SET module_scopes = COALESCE(cr.module_scopes, '{}'::jsonb) || jsonb_build_object(
  'staff',
  CASE
    WHEN cr.institution_scope = 'all' THEN 'all_institutions'
    WHEN cr.institution_scope = 'own' AND (cr.permissions->>'staff.view')::boolean IS TRUE
      THEN 'own_institution'
    ELSE 'own_records'
  END
),
updated_at = NOW();

-- Hard override for principal + hod regardless of how permissions were stored:
UPDATE public.custom_roles
SET module_scopes = COALESCE(module_scopes, '{}'::jsonb) || jsonb_build_object('staff', 'own_institution'),
    updated_at = NOW()
WHERE role_key IN ('hod', 'principal');

-- Hard override for super_admin + hr_admin:
UPDATE public.custom_roles
SET module_scopes = COALESCE(module_scopes, '{}'::jsonb) || jsonb_build_object('staff', 'all_institutions'),
    updated_at = NOW()
WHERE role_key IN ('super_admin', 'hr_admin');

-- 3. Faculty: force staff.edit stays TRUE (self-edit allowed per design),
--    but turn off institution-wide analytics tabs that don't make sense
--    for a single-row scope.
UPDATE public.custom_roles
SET permissions = permissions
                  || '{"staff.view": true}'::jsonb
                  || '{"staff.edit": true}'::jsonb
                  || '{"staff.create": false}'::jsonb
                  || '{"staff.delete": false}'::jsonb
                  || '{"staff.status_update": false}'::jsonb
                  || '{"staff.dashboard.view": false}'::jsonb
                  || '{"staff.categories.view": false}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'faculty';

-- 4. Every other role landing in 'own_records' (not faculty, not hod/principal,
--    not super_admin/hr_admin): grant staff.view, force everything else off.
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb)
                  || '{"staff.view": true}'::jsonb
                  || '{"staff.edit": false}'::jsonb
                  || '{"staff.create": false}'::jsonb
                  || '{"staff.delete": false}'::jsonb
                  || '{"staff.status_update": false}'::jsonb
                  || '{"staff.dashboard.view": false}'::jsonb
                  || '{"staff.categories.view": false}'::jsonb
                  || '{"staff.class_incharges.view": false}'::jsonb,
    updated_at = NOW()
WHERE module_scopes->>'staff' = 'own_records'
  AND role_key NOT IN ('faculty', 'hod', 'principal', 'super_admin', 'hr_admin');

-- 5. Replace staff RLS policies with scope-aware versions.
-- The previous "staff_*_permission" policies (set 2026-04 in 03_policies.sql:4884-4910)
-- only gated on super_admin/admin/permission-key and did not honor row scope.
DROP POLICY IF EXISTS "staff_select_permission" ON public.staff;
DROP POLICY IF EXISTS "staff_insert_permission" ON public.staff;
DROP POLICY IF EXISTS "staff_update_permission" ON public.staff;
DROP POLICY IF EXISTS "staff_delete_permission" ON public.staff;
-- Belt-and-braces: also drop older policy names in case they linger in dev/staging
DROP POLICY IF EXISTS "staff_select_by_institution_access" ON public.staff;
DROP POLICY IF EXISTS "staff_select_event_coordinator"     ON public.staff;
DROP POLICY IF EXISTS "staff_insert_by_access_type"        ON public.staff;
DROP POLICY IF EXISTS "staff_update_by_access_type"        ON public.staff;
DROP POLICY IF EXISTS "staff_delete_by_admin_access"       ON public.staff;

CREATE POLICY "staff_select_scope_aware" ON public.staff
FOR SELECT USING (
  is_super_admin()
  OR (
    user_has_permission('staff.view')
    AND (
      CASE get_user_module_scope('staff')
        WHEN 'all_institutions' THEN TRUE
        WHEN 'own_institution'  THEN role_has_institution_access(staff.institution_id)
        WHEN 'own_records'      THEN staff.profile_id = auth.uid()
        ELSE FALSE
      END
    )
  )
);

CREATE POLICY "staff_insert_scope_aware" ON public.staff
FOR INSERT WITH CHECK (
  is_super_admin()
  OR (
    user_has_permission('staff.create')
    AND (
      CASE get_user_module_scope('staff')
        WHEN 'all_institutions' THEN TRUE
        WHEN 'own_institution'  THEN role_has_institution_access(staff.institution_id)
        -- own_records can never INSERT (their row should already exist via HR)
        ELSE FALSE
      END
    )
  )
);

CREATE POLICY "staff_update_scope_aware" ON public.staff
FOR UPDATE USING (
  is_super_admin()
  OR (
    user_has_permission('staff.edit')
    AND (
      CASE get_user_module_scope('staff')
        WHEN 'all_institutions' THEN TRUE
        WHEN 'own_institution'  THEN role_has_institution_access(staff.institution_id)
        WHEN 'own_records'      THEN staff.profile_id = auth.uid()
        ELSE FALSE
      END
    )
  )
);

CREATE POLICY "staff_delete_scope_aware" ON public.staff
FOR DELETE USING (
  is_super_admin()
  OR (
    user_has_permission('staff.delete')
    AND (
      CASE get_user_module_scope('staff')
        WHEN 'all_institutions' THEN TRUE
        WHEN 'own_institution'  THEN role_has_institution_access(staff.institution_id)
        -- own_records never deletes
        ELSE FALSE
      END
    )
  )
);

-- 6. Smoke verify - raises if any custom_role still has no staff scope.
DO $$
DECLARE
  missing_count int;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM custom_roles
  WHERE module_scopes->>'staff' IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % custom_roles still missing module_scopes.staff', missing_count;
  END IF;
END$$;

COMMIT;
