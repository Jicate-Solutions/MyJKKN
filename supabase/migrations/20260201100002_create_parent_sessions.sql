-- Create parent_sessions table for secure session management
-- Updated: 2026-02-01 - Initial creation for security hardening

CREATE TABLE IF NOT EXISTS parent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE,
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

-- Indexes for performance
CREATE INDEX idx_parent_sessions_token ON parent_sessions(session_token) WHERE NOT revoked;
CREATE INDEX idx_parent_sessions_parent_id ON parent_sessions(parent_id) WHERE NOT revoked;
CREATE INDEX idx_parent_sessions_expires_at ON parent_sessions(expires_at) WHERE NOT revoked;

-- Enable RLS
ALTER TABLE parent_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Only the parent can view their own sessions
CREATE POLICY parent_sessions_select_own
  ON parent_sessions
  FOR SELECT
  USING (parent_id = auth.uid()::uuid);

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_parent_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM parent_sessions
  WHERE expires_at < NOW()
    OR (revoked = TRUE AND revoked_at < NOW() - INTERVAL '30 days');
END;
$$;

-- Comment
COMMENT ON TABLE parent_sessions IS 'Secure session management for parent portal authentication';
