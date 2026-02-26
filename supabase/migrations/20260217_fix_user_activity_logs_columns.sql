-- Migration: Fix user_activity_logs column names
-- Created: 2026-02-17
-- Purpose: Align user_activity_logs with application code expectations
-- The code in lib/services/activity-service.ts expects 'action_type' and 'description'
-- but migration 20260214 created 'activity_type' and 'activity_description'

DO $$
BEGIN
  -- Rename activity_type to action_type if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_activity_logs'
    AND column_name = 'activity_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_activity_logs'
    AND column_name = 'action_type'
  ) THEN
    ALTER TABLE public.user_activity_logs RENAME COLUMN activity_type TO action_type;
    RAISE NOTICE 'Renamed activity_type to action_type';
  END IF;

  -- Rename activity_description to description if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_activity_logs'
    AND column_name = 'activity_description'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_activity_logs'
    AND column_name = 'description'
  ) THEN
    ALTER TABLE public.user_activity_logs RENAME COLUMN activity_description TO description;
    RAISE NOTICE 'Renamed activity_description to description';
  END IF;

  -- Add missing columns that the application expects
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_activity_logs'
    AND column_name = 'resource_name'
  ) THEN
    ALTER TABLE public.user_activity_logs ADD COLUMN resource_name TEXT;
    RAISE NOTICE 'Added resource_name column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_activity_logs'
    AND column_name = 'request_url'
  ) THEN
    ALTER TABLE public.user_activity_logs ADD COLUMN request_url TEXT;
    RAISE NOTICE 'Added request_url column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_activity_logs'
    AND column_name = 'request_method'
  ) THEN
    ALTER TABLE public.user_activity_logs ADD COLUMN request_method VARCHAR(10);
    RAISE NOTICE 'Added request_method column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_activity_logs'
    AND column_name = 'status_code'
  ) THEN
    ALTER TABLE public.user_activity_logs ADD COLUMN status_code INTEGER;
    RAISE NOTICE 'Added status_code column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_activity_logs'
    AND column_name = 'session_id'
  ) THEN
    ALTER TABLE public.user_activity_logs ADD COLUMN session_id TEXT;
    RAISE NOTICE 'Added session_id column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_activity_logs'
    AND column_name = 'institution_id'
  ) THEN
    ALTER TABLE public.user_activity_logs ADD COLUMN institution_id UUID;
    RAISE NOTICE 'Added institution_id column';
  END IF;

  -- Ensure description column is NOT NULL with a default if needed
  -- (only if the column exists and isn't already NOT NULL)
  BEGIN
    ALTER TABLE public.user_activity_logs
    ALTER COLUMN description SET DEFAULT '';
  EXCEPTION WHEN OTHERS THEN
    -- Column might not exist yet or already has the constraint
    NULL;
  END;
END $$;

-- Update index - drop old one if exists, create new one
DROP INDEX IF EXISTS idx_user_activity_logs_activity_type;
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action_type ON public.user_activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON public.user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON public.user_activity_logs(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE public.user_activity_logs IS 'Tracks user activity for audit and analytics. Columns: action_type (login, logout, create, update, delete, view, etc), description, resource_type/id/name for context.';
