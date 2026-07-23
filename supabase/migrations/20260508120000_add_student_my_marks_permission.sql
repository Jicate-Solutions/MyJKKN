-- Migration: Grant student role view-only access to My Marks portal
-- Created: 2026-05-08
-- Purpose: Add learners.my-marks.view permission to the 'student' role so
--          students can access /learners/my-marks (Internal Marks + Result tabs).
-- Related: app/(routes)/learners/my-marks/* — view-only student portal
-- Notes:
--   * View-only — there are no create/edit/delete actions on this page; marks
--     are read from COE and rendered without write paths.
--   * Single permission key (learners.my-marks.view) gates the whole feature,
--     including the Internal and Result top-level tabs.

BEGIN;

-- Grant learners.my-marks.view to the student role.
UPDATE custom_roles
SET
  permissions = permissions || jsonb_build_object('learners.my-marks.view', true),
  updated_at = now()
WHERE role_key = 'student';

-- Verify the update
DO $$
DECLARE
  v_has_my_marks TEXT;
  v_role_exists  BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM custom_roles WHERE role_key = 'student')
  INTO v_role_exists;

  IF NOT v_role_exists THEN
    RAISE WARNING 'Role with role_key = ''student'' not found — permission was not granted to any user. Seed the student role and re-run this migration if needed.';
    RETURN;
  END IF;

  SELECT permissions->>'learners.my-marks.view'
  INTO v_has_my_marks
  FROM custom_roles
  WHERE role_key = 'student';

  IF v_has_my_marks = 'true' THEN
    RAISE NOTICE 'Student role now has learners.my-marks.view ✓';
    RAISE NOTICE 'Students can access /learners/my-marks (Internal + Result tabs)';
  ELSE
    RAISE EXCEPTION 'Failed to grant learners.my-marks.view to student role';
  END IF;
END $$;

COMMIT;
