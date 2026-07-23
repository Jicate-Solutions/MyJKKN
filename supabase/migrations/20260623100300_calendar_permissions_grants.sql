-- =====================================================================
-- Grant calendar.* keys                                                  2026-06-23
-- calendar.view              → broad (all role users can view the calendar)
-- calendar.people_leave.view → approver/admin roles only (person-level leave, Phase 2)
-- calendar.holidays.manage   → super_admin + administrator
-- calendar.config.manage     → super_admin + administrator
-- NOTE: role_key is 'administrator' (NOT 'admin' — no such role_key exists).
-- Declaring keys in lib/constants/permissions.ts only populates the Role-
-- Management dialog; these JSONB grants are what actually surface the module.
-- Idempotent (re-runnable). Verified: 70/70 roles view, 7 people_leave, 2 manage.
-- =====================================================================

-- broad VIEW grant: every active role gets calendar.view
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('calendar.view', true),
       updated_at = now()
 WHERE COALESCE((permissions->>'calendar.view')::boolean, false) = false;

-- person-level leave overlay: approver/admin roles (Phase 2 will consume this)
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('calendar.people_leave.view', true),
       updated_at = now()
 WHERE role_key IN ('super_admin','administrator','principal','hod','hr_admin','hr_manager','hr_head')
   AND COALESCE((permissions->>'calendar.people_leave.view')::boolean, false) = false;

-- manage grants: super_admin + administrator
UPDATE public.custom_roles
   SET permissions = permissions
        || jsonb_build_object('calendar.holidays.manage', true)
        || jsonb_build_object('calendar.config.manage', true),
       updated_at = now()
 WHERE role_key IN ('super_admin','administrator')
   AND COALESCE((permissions->>'calendar.holidays.manage')::boolean, false) = false;
