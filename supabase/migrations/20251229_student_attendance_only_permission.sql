-- Migration: Fix student role to show only attendance (not all learners pages)
-- Created: 2025-12-29
-- Issue: Students had learners.view permission which showed ALL learners management pages
-- Fix: Replace learners.view with learners.attendance.view to show only "My Attendance"

BEGIN;

-- Update student role permissions
-- Remove: learners.view (access to all learners pages)
-- Add: learners.attendance.view (access to only student's own attendance)
UPDATE custom_roles
SET
  permissions = permissions - 'learners.view' || jsonb_build_object('learners.attendance.view', true),
  updated_at = now()
WHERE role_key = 'student'
  AND (permissions->>'learners.view' = 'true');

-- Verify the update
DO $$
DECLARE
  v_has_learners_view TEXT;
  v_has_attendance_view TEXT;
BEGIN
  SELECT
    permissions->>'learners.view',
    permissions->>'learners.attendance.view'
  INTO v_has_learners_view, v_has_attendance_view
  FROM custom_roles
  WHERE role_key = 'student';

  IF v_has_learners_view IS NOT NULL THEN
    RAISE EXCEPTION 'Student role still has learners.view permission';
  END IF;

  IF v_has_attendance_view = 'true' THEN
    RAISE NOTICE 'Student role successfully updated with learners.attendance.view permission only';
  ELSE
    RAISE EXCEPTION 'Failed to add learners.attendance.view permission';
  END IF;
END $$;

COMMIT;
