-- ============================================
-- Migration: Add Student Dashboard Widgets
-- Created: 2025-12-27
-- Purpose: Create student-specific widgets for portal dashboard
-- ============================================

-- Insert student widget types
INSERT INTO public.dashboard_widget_types (
  widget_key,
  widget_name,
  description,
  category,
  data_source,
  default_config,
  permissions_required,
  is_active
) VALUES
-- My Profile Widget
(
  'student_my_profile',
  'My Profile',
  'View and manage your student profile information',
  'kpi',
  'student_profile',
  '{"showAvatar": true, "showRollNumber": true, "showStatus": true}'::jsonb,
  ARRAY['view_dashboard', 'profile.view'],
  true
),

-- My Attendance Widget
(
  'student_my_attendance',
  'My Attendance',
  'Track your attendance percentage and records',
  'chart',
  'student_attendance',
  '{"period": "last_30_days", "showChart": true, "chartType": "area"}'::jsonb,
  ARRAY['view_dashboard', 'academic.attendance.view'],
  true
),

-- My Fees Widget
(
  'student_my_fees',
  'My Fees',
  'View your fee status, pending bills, and payment history',
  'kpi',
  'student_billing',
  '{"currency": "INR", "showPending": true, "showHistory": false}'::jsonb,
  ARRAY['view_dashboard', 'billing.view'],
  true
),

-- Today's Classes Widget
(
  'student_my_timetable',
  'Today''s Classes',
  'View your class schedule for today',
  'table',
  'student_timetable',
  '{"showCurrent": true, "highlightNext": true}'::jsonb,
  ARRAY['view_dashboard', 'academic.timetables.view'],
  true
),

-- My Results Widget
(
  'student_my_results',
  'My Results',
  'View your exam results and grades',
  'table',
  'student_results',
  '{"showLatest": true, "showGPA": true}'::jsonb,
  ARRAY['view_dashboard', 'academic.view'],
  true
),

-- Announcements Widget
(
  'student_announcements',
  'Announcements',
  'View important announcements and notifications',
  'list',
  'student_announcements',
  '{"limit": 5, "showUnreadOnly": false}'::jsonb,
  ARRAY['view_dashboard'],
  true
)

-- Avoid duplicates: only insert if widget_key doesn't exist
ON CONFLICT (widget_key) DO NOTHING;

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Added student dashboard widget types';
END $$;
