-- =====================================================
-- Migration: Remove Dashboard Widget System
-- Date: 2025-01-28
-- Description: Removes all dashboard widget configuration tables,
--              policies, triggers, and functions
-- =====================================================

-- Drop dashboard tables with CASCADE to remove all dependencies
DROP TABLE IF EXISTS public.dashboard_widgets CASCADE;
DROP TABLE IF EXISTS public.dashboard_widget_types CASCADE;
DROP TABLE IF EXISTS public.dashboard_configurations CASCADE;

-- Remove any related functions
DROP FUNCTION IF EXISTS update_dashboard_configuration_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_dashboard_widget_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_dashboard_widget_type_updated_at() CASCADE;

-- Remove any related views
DROP VIEW IF EXISTS dashboard_widgets_with_types CASCADE;
DROP VIEW IF EXISTS user_dashboard_summary CASCADE;

-- Migration complete
COMMENT ON SCHEMA public IS 'Dashboard widget system removed - 2025-01-28';
