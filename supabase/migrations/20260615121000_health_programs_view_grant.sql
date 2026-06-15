-- 20260615121000_health_programs_view_grant.sql
-- Grant `health.programs.view` to the participant roles so students AND staff
-- can open the Wellness Programs consume UI (/health/programs).
--
-- Idempotent JSONB merge: only touches rows that don't already have the grant,
-- so re-running is a no-op. The `health.programs.manage` key stays restricted
-- to whoever the admin CRUD PR grants it to (not touched here).
--
-- Spec: specs/health-wellness-programs-2026-06-15.md
-- Created: 2026-06-15

UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb)
                  || '{"health.programs.view": true}'::jsonb,
    updated_at  = now()
WHERE role_key IN (
        'student',
        'production_learner',
        'staff',
        'faculty',
        'school_faculty',
        'hod',
        'principal'
      )
  AND COALESCE(permissions->>'health.programs.view', 'false') <> 'true';
