-- =====================================================================================
-- Dashboard Widgets Seed Data
-- =====================================================================================
-- Description: Seed data for dashboard_widgets table
--
-- This file populates the dashboard_widgets table with all default widgets for each role:
-- - Student Role: 5 widgets (attendance, timetable, billing, events, celebrations)
-- - Faculty Role: 7 widgets (classes, attendance, students, leave, events, celebrations, announcements)
-- - Leadership Role: 5 widgets (overview, attendance, approvals, celebrations, announcements)
-- - Admin Role: 5 widgets (system overview, activity, at-risk students, celebrations, system health)
--
-- The ON CONFLICT clause ensures this file is idempotent and can be safely rerun.
-- All widgets are set to default_visible = true for initial setup.
--
-- Created: 2025-01-30
-- =====================================================================================

-- =====================================================================================
-- STUDENT ROLE WIDGETS
-- =====================================================================================
INSERT INTO dashboard_widgets (
  widget_id,
  role,
  title,
  description,
  category,
  default_visible,
  display_order,
  required_permission
) VALUES
  (
    'student-attendance-summary',
    'student',
    'My Attendance',
    'View your attendance percentage and recent attendance records across all courses.',
    'academic',
    true,
    1,
    'view_own_attendance'
  ),
  (
    'student-today-timetable',
    'student',
    'Today''s Classes',
    'See your class schedule for today with timings, subjects, and faculty information.',
    'academic',
    true,
    2,
    null
  ),
  (
    'student-billing-summary',
    'student',
    'Billing Summary',
    'Track your fee payments, pending bills, and payment history at a glance.',
    'billing',
    true,
    3,
    'view_own_bills'
  ),
  (
    'student-upcoming-events',
    'student',
    'Upcoming Events',
    'Stay updated with upcoming institutional events, exams, and important dates.',
    'events',
    true,
    4,
    null
  ),
  (
    'celebrations-today',
    'student',
    'Celebrations Today',
    'Celebrate birthdays and special occasions of students and staff in your institution.',
    'celebrations',
    true,
    5,
    null
  )
ON CONFLICT (widget_id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_visible = EXCLUDED.default_visible,
  display_order = EXCLUDED.display_order,
  required_permission = EXCLUDED.required_permission;

-- =====================================================================================
-- FACULTY ROLE WIDGETS
-- =====================================================================================
INSERT INTO dashboard_widgets (
  widget_id,
  role,
  title,
  description,
  category,
  default_visible,
  display_order,
  required_permission
) VALUES
  (
    'faculty-today-classes',
    'faculty',
    'Today''s Classes',
    'View your teaching schedule for today with class timings, sections, and subjects.',
    'academic',
    true,
    1,
    'view_timetables'
  ),
  (
    'faculty-pending-attendance',
    'faculty',
    'Pending Attendance',
    'Quick access to mark pending attendance for your classes and track completion status.',
    'academic',
    true,
    2,
    'mark_attendance'
  ),
  (
    'faculty-students-overview',
    'faculty',
    'My Students',
    'Overview of students in your classes with attendance and performance metrics.',
    'academic',
    true,
    3,
    'view_students'
  ),
  (
    'faculty-leave-approvals',
    'faculty',
    'Leave Approvals',
    'Review and approve student leave requests submitted to you for action.',
    'leave',
    true,
    4,
    'approve_leave'
  ),
  (
    'faculty-upcoming-events',
    'faculty',
    'Upcoming Events',
    'Stay informed about institutional events, meetings, and academic calendar dates.',
    'events',
    true,
    5,
    null
  ),
  (
    'celebrations-today',
    'faculty',
    'Celebrations Today',
    'Celebrate birthdays and special occasions of students and staff in your institution.',
    'celebrations',
    true,
    6,
    null
  ),
  (
    'faculty-announcements',
    'faculty',
    'Announcements',
    'Important announcements and updates from the institution and departments.',
    'communication',
    true,
    7,
    null
  )
ON CONFLICT (widget_id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_visible = EXCLUDED.default_visible,
  display_order = EXCLUDED.display_order,
  required_permission = EXCLUDED.required_permission;

-- =====================================================================================
-- LEADERSHIP ROLE WIDGETS (Principal & HOD)
-- =====================================================================================
INSERT INTO dashboard_widgets (
  widget_id,
  role,
  title,
  description,
  category,
  default_visible,
  display_order,
  required_permission
) VALUES
  (
    'leadership-overview',
    'principal',
    'Overview',
    'High-level institutional metrics including student count, attendance rates, and key statistics.',
    'overview',
    true,
    1,
    'view_reports'
  ),
  (
    'leadership-attendance-summary',
    'principal',
    'Attendance Summary',
    'Department-wise and class-wise attendance summary with trends and alerts.',
    'academic',
    true,
    2,
    'view_attendance_reports'
  ),
  (
    'leadership-pending-approvals',
    'principal',
    'Pending Approvals',
    'Review pending leave requests, applications, and other items requiring your approval.',
    'approvals',
    true,
    3,
    'approve_leave'
  ),
  (
    'celebrations-today',
    'principal',
    'Celebrations Today',
    'Celebrate birthdays and special occasions of students and staff in your institution.',
    'celebrations',
    true,
    4,
    null
  ),
  (
    'leadership-announcements',
    'principal',
    'Announcements',
    'Important announcements and updates for leadership team and institution-wide communications.',
    'communication',
    true,
    5,
    null
  )
ON CONFLICT (widget_id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_visible = EXCLUDED.default_visible,
  display_order = EXCLUDED.display_order,
  required_permission = EXCLUDED.required_permission;

-- HOD widgets (same as principal)
INSERT INTO dashboard_widgets (
  widget_id,
  role,
  title,
  description,
  category,
  default_visible,
  display_order,
  required_permission
) VALUES
  (
    'leadership-overview',
    'hod',
    'Overview',
    'High-level institutional metrics including student count, attendance rates, and key statistics.',
    'overview',
    true,
    1,
    'view_reports'
  ),
  (
    'leadership-attendance-summary',
    'hod',
    'Attendance Summary',
    'Department-wise and class-wise attendance summary with trends and alerts.',
    'academic',
    true,
    2,
    'view_attendance_reports'
  ),
  (
    'leadership-pending-approvals',
    'hod',
    'Pending Approvals',
    'Review pending leave requests, applications, and other items requiring your approval.',
    'approvals',
    true,
    3,
    'approve_leave'
  ),
  (
    'celebrations-today',
    'hod',
    'Celebrations Today',
    'Celebrate birthdays and special occasions of students and staff in your institution.',
    'celebrations',
    true,
    4,
    null
  ),
  (
    'leadership-announcements',
    'hod',
    'Announcements',
    'Important announcements and updates for leadership team and institution-wide communications.',
    'communication',
    true,
    5,
    null
  )
ON CONFLICT (widget_id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_visible = EXCLUDED.default_visible,
  display_order = EXCLUDED.display_order,
  required_permission = EXCLUDED.required_permission;

-- =====================================================================================
-- ADMIN ROLE WIDGETS (Super Admin & Administrator)
-- =====================================================================================
INSERT INTO dashboard_widgets (
  widget_id,
  role,
  title,
  description,
  category,
  default_visible,
  display_order,
  required_permission
) VALUES
  (
    'admin-system-overview',
    'super_admin',
    'System Overview',
    'View system-wide statistics including total users, active sessions, and platform health metrics.',
    'overview',
    true,
    1,
    'view_system_stats'
  ),
  (
    'admin-recent-activity',
    'super_admin',
    'Recent Activity',
    'Monitor recent user actions, system events, and audit logs for security and compliance.',
    'activity',
    true,
    2,
    'view_audit_logs'
  ),
  (
    'admin-at-risk-students',
    'super_admin',
    'At-Risk Students',
    'Identify students with low attendance or academic performance requiring intervention.',
    'academic',
    true,
    3,
    'view_students'
  ),
  (
    'celebrations-today',
    'super_admin',
    'Celebrations Today',
    'Celebrate birthdays and special occasions of students and staff in your institution.',
    'celebrations',
    true,
    4,
    null
  ),
  (
    'admin-system-health',
    'super_admin',
    'System Health',
    'Real-time system health monitoring including database status, API performance, and error rates.',
    'system',
    true,
    5,
    'view_system_stats'
  )
ON CONFLICT (widget_id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_visible = EXCLUDED.default_visible,
  display_order = EXCLUDED.display_order,
  required_permission = EXCLUDED.required_permission;

-- Administrator widgets (same as super_admin)
INSERT INTO dashboard_widgets (
  widget_id,
  role,
  title,
  description,
  category,
  default_visible,
  display_order,
  required_permission
) VALUES
  (
    'admin-system-overview',
    'administrator',
    'System Overview',
    'View system-wide statistics including total users, active sessions, and platform health metrics.',
    'overview',
    true,
    1,
    'view_system_stats'
  ),
  (
    'admin-recent-activity',
    'administrator',
    'Recent Activity',
    'Monitor recent user actions, system events, and audit logs for security and compliance.',
    'activity',
    true,
    2,
    'view_audit_logs'
  ),
  (
    'admin-at-risk-students',
    'administrator',
    'At-Risk Students',
    'Identify students with low attendance or academic performance requiring intervention.',
    'academic',
    true,
    3,
    'view_students'
  ),
  (
    'celebrations-today',
    'administrator',
    'Celebrations Today',
    'Celebrate birthdays and special occasions of students and staff in your institution.',
    'celebrations',
    true,
    4,
    null
  ),
  (
    'admin-system-health',
    'administrator',
    'System Health',
    'Real-time system health monitoring including database status, API performance, and error rates.',
    'system',
    true,
    5,
    'view_system_stats'
  )
ON CONFLICT (widget_id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_visible = EXCLUDED.default_visible,
  display_order = EXCLUDED.display_order,
  required_permission = EXCLUDED.required_permission;

-- =====================================================================================
-- END OF SEED DATA
-- =====================================================================================
