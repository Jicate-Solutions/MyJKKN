-- Migration: Update student role timetable permission
-- Created: 2026-01-14
-- Issue: Students had academic.timetables.view which shows admin timetable management
-- Fix: Replace academic.timetables.view with learners.timetable.view for student's own timetable
-- Related: /learners/my-timetable page (mobile-first student timetable view)

BEGIN;

-- Update student role permissions
-- Remove: academic.timetables.view (admin timetable management)
-- Add: learners.timetable.view (student's own timetable viewing)
UPDATE custom_roles
SET
  permissions = permissions - 'academic.timetables.view' || jsonb_build_object('learners.timetable.view', true),
  updated_at = now()
WHERE role_key = 'student'
  AND (permissions->>'academic.timetables.view' = 'true');

-- Verify the update
DO $$
DECLARE
  v_has_academic_view TEXT;
  v_has_learners_view TEXT;
  v_has_attendance_view TEXT;
BEGIN
  SELECT
    permissions->>'academic.timetables.view',
    permissions->>'learners.timetable.view',
    permissions->>'learners.attendance.view'
  INTO v_has_academic_view, v_has_learners_view, v_has_attendance_view
  FROM custom_roles
  WHERE role_key = 'student';

  IF v_has_academic_view IS NOT NULL THEN
    RAISE EXCEPTION 'Student role still has academic.timetables.view permission';
  END IF;

  IF v_has_learners_view = 'true' THEN
    RAISE NOTICE 'Student role successfully updated with learners.timetable.view permission';
    RAISE NOTICE 'Students can now access /learners/my-timetable (mobile-first view)';
  ELSE
    RAISE EXCEPTION 'Failed to add learners.timetable.view permission';
  END IF;

  -- Also verify attendance permission exists (should have been set by previous migration)
  IF v_has_attendance_view = 'true' THEN
    RAISE NOTICE 'Student role has learners.attendance.view permission ✓';
  ELSE
    RAISE WARNING 'Student role missing learners.attendance.view permission';
  END IF;
END $$;

COMMIT;
