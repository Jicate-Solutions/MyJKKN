-- =============================================
-- MyJKKN Database Schema - Complete
-- =============================================
-- This file combines all schema components in the correct order
-- for a fresh database installation.
--
-- Order of execution:
-- 1. Extensions
-- 2. Types and Enums
-- 3. Tables
-- 4. Indexes
-- 5. Functions
-- 6. Triggers
-- 7. Views and Materialized Views
-- 8. Row Level Security
--
-- To use this file:
-- 1. Create a new Supabase project
-- 2. Run this complete schema file in the SQL editor
-- 3. Configure your environment variables
-- =============================================

-- Include extensions
\i 00_extensions.sql

-- Include types and enums
\i 01_types.sql

-- Include all tables
\i 02_tables.sql

-- Include indexes
\i 03_indexes.sql

-- Include functions
\i 04_functions.sql

-- Include triggers
\i 05_triggers.sql

-- Include views
\i 06_views.sql

-- Include RLS policies
\i 07_rls.sql

-- =============================================
-- Post-installation steps
-- =============================================

-- Initialize materialized views
REFRESH MATERIALIZED VIEW activity_stats;
REFRESH MATERIALIZED VIEW mv_student_billing_summary;

-- Insert default data (if needed)
-- Example: Insert default roles
INSERT INTO custom_roles (role_key, role_name, description, permissions, is_system_role) VALUES
('guest', 'Guest', 'Default role for new users', '{}', true),
('student', 'Student', 'Student role with access to personal data', '{"view_own_data": true}', true),
('faculty', 'Faculty', 'Faculty role with teaching permissions', '{"view_students": true, "manage_attendance": true}', true),
('staff', 'Staff', 'Staff role with department access', '{"view_department": true}', true),
('administrator', 'Administrator', 'Administrator with full institution access', '{"manage_institution": true}', true),
('super_admin', 'Super Admin', 'Super administrator with system-wide access', '{"manage_all": true}', true),
('accounts', 'Accounts', 'Accounts role with billing permissions', '{"manage_billing": true}', true)
ON CONFLICT (role_key) DO NOTHING;

-- Insert default dashboard widget types
INSERT INTO dashboard_widget_types (widget_key, widget_name, description, default_config, allowed_roles) VALUES
('welcome', 'Welcome Widget', 'Displays welcome message and quick stats', '{"showStats": true}', ARRAY['student', 'faculty', 'staff', 'administrator', 'super_admin']::user_role[]),
('quick_links', 'Quick Links', 'Shows frequently used links', '{"maxLinks": 6}', ARRAY['student', 'faculty', 'staff', 'administrator', 'super_admin']::user_role[]),
('recent_activity', 'Recent Activity', 'Shows recent user activity', '{"limit": 10}', ARRAY['student', 'faculty', 'staff', 'administrator', 'super_admin']::user_role[]),
('billing_summary', 'Billing Summary', 'Shows billing overview', '{"showChart": true}', ARRAY['student', 'accounts', 'administrator', 'super_admin']::user_role[]),
('attendance_summary', 'Attendance Summary', 'Shows attendance statistics', '{"period": "month"}', ARRAY['student', 'faculty', 'administrator', 'super_admin']::user_role[])
ON CONFLICT (widget_key) DO NOTHING;

-- =============================================
-- Notes
-- =============================================
-- 1. Remember to configure Supabase Storage buckets for file uploads
-- 2. Set up proper environment variables in your application
-- 3. Configure email templates for authentication
-- 4. Set up scheduled jobs for materialized view refresh
-- 5. Configure backup policies
-- ============================================= 