-- Migration: Create Session Tracking Tables and Functions
-- Created: 2026-02-14
-- Purpose: Fix missing database tables causing auth callback errors

-- ============================================
-- 1. Create user_sessions table
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_end TIMESTAMPTZ,
  duration_minutes INTEGER,
  institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
  department_id UUID,
  program_id UUID,
  role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT,
  os TEXT,
  browser TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_institution_id ON public.user_sessions(institution_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_start ON public.user_sessions(session_start DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON public.user_sessions(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sessions"
  ON public.user_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert sessions"
  ON public.user_sessions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update sessions"
  ON public.user_sessions
  FOR UPDATE
  USING (true);

-- ============================================
-- 2. Create user_activity_logs table
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  activity_description TEXT,
  module TEXT,
  action TEXT,
  resource_id UUID,
  resource_type TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON public.user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON public.user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_activity_type ON public.user_activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_module ON public.user_activity_logs(module);

-- Enable RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own activity logs"
  ON public.user_activity_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert activity logs"
  ON public.user_activity_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- 3. Create get_user_organizational_context function
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_organizational_context(p_user_id UUID)
RETURNS TABLE (
  institution_id UUID,
  department_id UUID,
  program_id UUID,
  role TEXT
) AS $$
BEGIN
  -- Get user's organizational context from profiles table
  RETURN QUERY
  SELECT
    p.institution_id,
    p.department_id,
    p.program_id,
    p.role
  FROM public.profiles p
  WHERE p.id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_organizational_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organizational_context(UUID) TO anon;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE public.user_sessions IS 'Tracks user login sessions for analytics and security';
COMMENT ON TABLE public.user_activity_logs IS 'Logs user activities for audit trail and analytics';
COMMENT ON FUNCTION public.get_user_organizational_context IS 'Returns user organizational context (institution, department, program, role)';
