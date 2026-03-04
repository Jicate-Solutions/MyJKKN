-- Migration: Fix session tracking schema to match session-tracking-service.ts
-- Created: 2026-03-03
-- Purpose: Resolve PGRST202 (RPC not found) and PGRST205 (table not found) errors
--          that appear in auth callback logs on login.
--
-- Root cause: The original migration 20260214_create_session_tracking_tables.sql
--             used a mismatched schema (id UUID PK, session_start, session_end, etc.)
--             that did not match what session-tracking-service.ts inserts/queries.
--
-- This migration is fully idempotent. Safe to re-apply.
-- Key changes applied to staging:
--   1. user_sessions table (correct schema with session_id TEXT, login_at, etc.)
--   2. get_user_organizational_context - updated return type to include semester_id/section_id
--   3. close_user_session - hardened with SET search_path
--   4. add_module_to_session - hardened with SET search_path

-- ============================================================
-- 1. user_sessions table
-- ============================================================
-- NOTE: If table already exists (from a prior migration), this is a no-op.
-- The service inserts using: session_id, user_id, login_at, is_active, role,
-- institution_id, department_id, program_id, semester_id, section_id,
-- ip_address, user_agent, device_type, actions_count, modules_accessed
CREATE TABLE IF NOT EXISTS public.user_sessions (
  session_id       TEXT PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_at        TIMESTAMPTZ,
  duration_seconds INTEGER,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  role             TEXT,
  institution_id   UUID,
  department_id    UUID,
  program_id       UUID,
  semester_id      UUID,
  section_id       UUID,
  ip_address       TEXT,
  user_agent       TEXT,
  device_type      TEXT,
  actions_count    INTEGER DEFAULT 0,
  modules_accessed TEXT[] DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login_at
  ON public.user_sessions(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active
  ON public.user_sessions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_institution_id
  ON public.user_sessions(institution_id);

-- RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own sessions"
  ON public.user_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "System can insert sessions"
  ON public.user_sessions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "System can update sessions"
  ON public.user_sessions
  FOR UPDATE
  USING (true);

-- ============================================================
-- 2. get_user_organizational_context(p_user_id UUID)
-- Returns org context for a user from the profiles table.
-- semester_id / section_id are returned as NULL because the
-- profiles table does not have those columns.
--
-- Must DROP + CREATE (not OR REPLACE) to change the return type.
-- ============================================================
DROP FUNCTION IF EXISTS public.get_user_organizational_context(UUID);

CREATE FUNCTION public.get_user_organizational_context(p_user_id UUID)
RETURNS TABLE (
  institution_id UUID,
  department_id  UUID,
  program_id     UUID,
  semester_id    UUID,
  section_id     UUID,
  role           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.institution_id,
    p.department_id,
    NULL::UUID AS program_id,
    NULL::UUID AS semester_id,
    NULL::UUID AS section_id,
    p.role
  FROM public.profiles p
  WHERE p.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_organizational_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organizational_context(UUID) TO service_role;

-- ============================================================
-- 3. close_user_session(p_session_id TEXT, p_logout_at TIMESTAMPTZ)
-- Called by SessionTrackingService.closeSession()
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_user_session(
  p_session_id TEXT,
  p_logout_at  TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_sessions
  SET
    is_active        = false,
    logout_at        = p_logout_at,
    duration_seconds = EXTRACT(EPOCH FROM (p_logout_at - login_at))::INTEGER,
    updated_at       = NOW()
  WHERE session_id = p_session_id
    AND is_active  = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_user_session(TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_user_session(TEXT, TIMESTAMPTZ) TO service_role;

-- ============================================================
-- 4. add_module_to_session(p_session_id TEXT, p_module_name TEXT)
-- Called by SessionTrackingService.trackModuleAccess()
-- Appends module to modules_accessed (deduplicated) and increments actions_count.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_module_to_session(
  p_session_id  TEXT,
  p_module_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_sessions
  SET
    actions_count    = actions_count + 1,
    modules_accessed = CASE
      WHEN p_module_name = ANY(modules_accessed) THEN modules_accessed
      ELSE modules_accessed || ARRAY[p_module_name]
    END,
    updated_at = NOW()
  WHERE session_id = p_session_id
    AND is_active  = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_module_to_session(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_module_to_session(TEXT, TEXT) TO service_role;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE public.user_sessions
  IS 'Tracks user login sessions for analytics and security. Schema matches session-tracking-service.ts exactly.';

COMMENT ON FUNCTION public.get_user_organizational_context(UUID)
  IS 'Returns org context (institution, department, role) from profiles. program_id/semester_id/section_id are NULL (not stored in profiles).';

COMMENT ON FUNCTION public.close_user_session(TEXT, TIMESTAMPTZ)
  IS 'Marks a session inactive and calculates duration_seconds from login_at to logout_at.';

COMMENT ON FUNCTION public.add_module_to_session(TEXT, TEXT)
  IS 'Appends module name to modules_accessed (deduplicated) and increments actions_count.';
