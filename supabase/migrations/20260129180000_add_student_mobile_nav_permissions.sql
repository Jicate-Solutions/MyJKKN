-- Add Mobile Navigation Permissions for Student Role
-- Issue: Student users can't see bottom navbar properly due to missing permissions
-- Solution: Grant necessary permissions for all student self-service features
-- Created: 2026-01-29

-- Update student role with all necessary permissions for mobile bottom navbar
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
  -- Overview/Dashboard
  'view_dashboard', true,
  'view_profile', true,

  -- Learners Portal (Student Self-Service)
  'learners.my-timetable.view', true,
  'learners.my-attendance.view', true,
  'learners.my-profile.view', true,
  'learners.leave_onduty.apply', true,
  'learners.leave_onduty.view', true,

  -- Bug Reports (NEW)
  'learners.bug_reports.view', true,

  -- Accounts/Billing (Student can view their own)
  'billing.schedule.view', true,
  'billing.receipts.view', true,
  'billing.invoices.view', true,

  -- Academic (View only - their own data)
  'academic.timetables.view', true,
  'academic.attendance.view', true
)
WHERE role_key = 'student'
  AND (
    -- Only update if permissions are missing (don't overwrite existing true values)
    permissions->>'view_dashboard' IS NULL OR
    permissions->>'learners.bug_reports.view' IS NULL OR
    permissions->>'learners.my-timetable.view' IS NULL
  );

-- Verify the update
SELECT
  role_key,
  role_name,
  permissions->>'view_dashboard' as has_dashboard,
  permissions->>'learners.my-timetable.view' as has_timetable,
  permissions->>'learners.bug_reports.view' as has_bug_reports,
  permissions->>'billing.schedule.view' as has_billing
FROM custom_roles
WHERE role_key = 'student';
