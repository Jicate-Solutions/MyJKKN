-- ============================================================
-- Migration: Grant Startup Studio permissions to student role
-- Created: 2026-03-05
-- Issue: Students (Day Scholar / Hostel Student) cannot see
--        Startup Studio section in sidebar because the student
--        role has no startup_studio.* permissions.
-- Fix: Add student-appropriate startup_studio permissions
--      (events, cycles, submissions) but NOT admin-only ones
--      (nif, analytics, registrations admin, checklists admin).
-- ============================================================

BEGIN;

-- Add startup_studio permissions to the student role
-- Students should be able to:
--   - View the Startup Studio dashboard
--   - View and create flywheel cycles
--   - View events and register/submit to them
--   - View problem bank
--   - View submissions (Appathon)
-- Students should NOT have:
--   - NIF Pipeline access (admin)
--   - Analytics access (admin)
--   - Registrations dashboard (admin)
--   - Checklists management (admin)

UPDATE custom_roles
SET
  permissions = permissions || jsonb_build_object(
    'startup_studio.view', true,
    'startup_studio.cycles.view', true,
    'startup_studio.cycles.create', true,
    'startup_studio.events.view', true,
    'startup_studio.events.register', true,
    'startup_studio.events.submit', true,
    'startup_studio.problem_bank.view', true,
    'startup_studio.submissions.view', true,
    'startup_studio.submissions.create', true
  ),
  updated_at = now()
WHERE role_key = 'student';

-- Verify the update
DO $$
DECLARE
  v_view TEXT;
  v_events TEXT;
  v_nif TEXT;
  v_analytics TEXT;
BEGIN
  SELECT
    permissions->>'startup_studio.view',
    permissions->>'startup_studio.events.view',
    permissions->>'startup_studio.nif.view',
    permissions->>'startup_studio.analytics.view'
  INTO v_view, v_events, v_nif, v_analytics
  FROM custom_roles
  WHERE role_key = 'student';

  IF v_view = 'true' AND v_events = 'true' THEN
    RAISE NOTICE 'Student role successfully granted Startup Studio access';
  ELSE
    RAISE EXCEPTION 'Failed to add startup_studio permissions to student role';
  END IF;

  -- Verify admin-only permissions were NOT added
  IF v_nif IS NULL AND v_analytics IS NULL THEN
    RAISE NOTICE 'Admin-only permissions correctly excluded from student role';
  ELSE
    RAISE WARNING 'Student role has admin-only startup_studio permissions that should be removed';
  END IF;
END $$;

COMMIT;
