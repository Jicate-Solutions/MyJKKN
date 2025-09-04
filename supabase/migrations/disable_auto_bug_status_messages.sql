-- Migration: Disable automatic status change messages for bug reports
-- Date: 2025-09-04
-- Description: Remove the trigger that automatically creates messages when bug report status changes
-- Reason: User requested to disable auto-messages when updating bug report status

-- Drop the trigger that creates automatic status change messages
DROP TRIGGER IF EXISTS trigger_bug_status_change_message ON bug_reports;

-- Note: The function create_bug_status_change_message() is kept in case it's needed in the future
-- The trigger definition is commented out in 04_triggers.sql