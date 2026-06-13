-- 20260511000001_staff_scope_align_with_design.sql
-- Follow-on to 20260511_staff_module_scope_lockdown.sql.
--
-- The base migration's CASE rule used institution_scope as a proxy and
-- mis-classified two cohorts:
--   * faculty                              (own_institution -> should be own_records)
--   * counselors / other scope='all' roles (all_institutions -> should be own_records)
--
-- Design narrative (single source of truth):
--   all_institutions : ONLY super_admin + hr_admin
--   own_institution  : ONLY hod + principal
--   own_records      : EVERY other role
--
-- This migration enumerates the broad-access roles explicitly and demotes all
-- others to own_records, then re-applies the Task 3/4 permission grants AFTER
-- the scope flip so the demoted roles end up with the correct permission set.
--
-- Idempotent.

BEGIN;

-- 7. Override scope to match design narrative.
--    Every role except super_admin/hr_admin/hod/principal -> own_records.
UPDATE public.custom_roles
SET module_scopes = COALESCE(module_scopes, '{}'::jsonb)
                    || jsonb_build_object('staff', 'own_records'),
    updated_at = NOW()
WHERE role_key NOT IN ('super_admin', 'hr_admin', 'hod', 'principal');

-- 8. Re-apply the own_records permission grant to every role now in that bucket
--    (catches previously-blocked counselors and any other role just demoted).
--    Faculty handled separately below to preserve staff.edit=true.
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
  AND role_key <> 'faculty';

-- 9. Faculty special case: own_records scope + retain staff.edit=true (self-edit).
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb)
                  || '{"staff.view": true}'::jsonb
                  || '{"staff.edit": true}'::jsonb
                  || '{"staff.create": false}'::jsonb
                  || '{"staff.delete": false}'::jsonb
                  || '{"staff.status_update": false}'::jsonb
                  || '{"staff.dashboard.view": false}'::jsonb
                  || '{"staff.categories.view": false}'::jsonb,
    updated_at = NOW()
WHERE role_key = 'faculty';

-- 10. Smoke verify:
--     (a) faculty.module_scopes.staff = 'own_records'
--     (b) admission_counselor.permissions.staff.view = 'true'
--     (c) Only super_admin/hr_admin/hod/principal are NOT 'own_records'
DO $$
DECLARE
  faculty_scope         text;
  counselor_view        text;
  unexpected_non_own    int;
  unexpected_non_owns   text;
BEGIN
  SELECT module_scopes->>'staff' INTO faculty_scope
  FROM custom_roles WHERE role_key = 'faculty';
  IF faculty_scope IS DISTINCT FROM 'own_records' THEN
    RAISE EXCEPTION 'Expected faculty.module_scopes.staff=own_records, got %', faculty_scope;
  END IF;

  SELECT permissions->>'staff.view' INTO counselor_view
  FROM custom_roles WHERE role_key = 'admission_counselor';
  IF counselor_view IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Expected admission_counselor.staff.view=true, got %', counselor_view;
  END IF;

  SELECT COUNT(*), string_agg(role_key, ', ' ORDER BY role_key)
  INTO unexpected_non_own, unexpected_non_owns
  FROM custom_roles
  WHERE module_scopes->>'staff' <> 'own_records'
    AND role_key NOT IN ('super_admin','hr_admin','hod','principal');
  IF unexpected_non_own > 0 THEN
    RAISE EXCEPTION 'Roles outside the broad-access allowlist are not own_records: %', unexpected_non_owns;
  END IF;
END$$;

COMMIT;
