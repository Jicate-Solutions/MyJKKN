-- Fix HOD role Leave/OnDuty permissions
-- Issue: Permissions were using dots (academic.leave.onduty.*) instead of underscores (academic.leave_onduty.*)
-- This caused the permission checks to fail since the code checks for underscore format
-- Created: 2026-01-29

-- Update HOD role permissions
UPDATE custom_roles
SET
  permissions =
    -- Remove old keys with dots
    permissions
    - 'academic.leave.onduty.approve'
    - 'academic.leave.onduty.manage'
    - 'academic.leave.onduty.reports'
    - 'learners.leave.onduty.apply'
    - 'learners.leave.onduty.view'
    - 'learners.leave.onduty.edit'
    - 'learners.leave.onduty.cancel'
    ||
    -- Add new keys with underscores (matching the permission definitions)
    jsonb_build_object(
      'academic.leave_onduty.approve', true,
      'academic.leave_onduty.manage', true,
      'academic.leave_onduty.reports', true,
      'learners.leave_onduty.apply', false,
      'learners.leave_onduty.view', false,
      'learners.leave_onduty.edit', false,
      'learners.leave_onduty.cancel', false
    ),
  updated_at = now()
WHERE role_key = 'hod';

-- Verify the update
SELECT
  role_key,
  role_name,
  permissions->'academic.leave_onduty.approve' as new_approve,
  permissions->'academic.leave_onduty.manage' as new_manage,
  permissions->'academic.leave_onduty.reports' as new_reports
FROM custom_roles
WHERE role_key = 'hod';
