-- Migration: Create Audit Trail Table
-- Created: 2025-09-30
-- Description: Audit logging system for tracking all user actions and system changes

-- =====================================================
-- 1. AUDIT LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'view', 'approve', 'reject', 'cancel', 'check_in', 'check_out', 'complete', 'archive', 'restore', 'export', 'import', 'login', 'logout')),
  module TEXT NOT NULL CHECK (module IN ('resource', 'category', 'reservation', 'approval', 'maintenance', 'notification', 'user', 'system')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_name TEXT,
  description TEXT NOT NULL,
  changes JSONB,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 2. INDEXES
-- =====================================================

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_module ON audit_logs(module);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- GIN index for JSONB search
CREATE INDEX idx_audit_logs_changes ON audit_logs USING GIN (changes);
CREATE INDEX idx_audit_logs_metadata ON audit_logs USING GIN (metadata);

-- =====================================================
-- 3. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view audit logs (read-only for most users)
CREATE POLICY "Users can view audit logs"
  ON audit_logs
  FOR SELECT
  USING (true); -- Adjust based on your security requirements

-- Only system/admin can create audit logs (typically done via service layer)
CREATE POLICY "System can create audit logs"
  ON audit_logs
  FOR INSERT
  WITH CHECK (true); -- Adjust based on your security requirements

-- Only admins can delete audit logs (optional, for data retention)
-- CREATE POLICY "Admins can delete old audit logs"
--   ON audit_logs
--   FOR DELETE
--   USING (
--     EXISTS (
--       SELECT 1 FROM profiles
--       WHERE id = auth.uid()
--       AND role = 'admin'
--     )
--   );

-- =====================================================
-- 4. PARTITIONING (OPTIONAL - FOR HIGH VOLUME)
-- =====================================================

-- Uncomment if you need time-based partitioning for performance
-- This example partitions by month

-- CREATE TABLE audit_logs_y2025m09 PARTITION OF audit_logs
--   FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

-- CREATE TABLE audit_logs_y2025m10 PARTITION OF audit_logs
--   FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

-- =====================================================
-- 5. RETENTION POLICY (OPTIONAL)
-- =====================================================

-- Function to delete old audit logs (e.g., older than 1 year)
CREATE OR REPLACE FUNCTION delete_old_audit_logs(retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule this function to run periodically (e.g., via cron or pg_cron)
-- SELECT delete_old_audit_logs(365); -- Delete logs older than 1 year

-- =====================================================
-- 6. COMMENTS
-- =====================================================

COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all system actions and changes';
COMMENT ON COLUMN audit_logs.action IS 'Type of action performed (create, update, delete, etc.)';
COMMENT ON COLUMN audit_logs.module IS 'System module where action occurred';
COMMENT ON COLUMN audit_logs.severity IS 'Severity level of the action (info, warning, error, critical)';
COMMENT ON COLUMN audit_logs.entity_type IS 'Type of entity affected (resource, reservation, etc.)';
COMMENT ON COLUMN audit_logs.entity_id IS 'UUID of the affected entity';
COMMENT ON COLUMN audit_logs.entity_name IS 'Human-readable name of the entity';
COMMENT ON COLUMN audit_logs.description IS 'Human-readable description of the action';
COMMENT ON COLUMN audit_logs.changes IS 'JSON object containing before/after values and fields changed';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context data (institution_id, department_id, etc.)';
COMMENT ON COLUMN audit_logs.ip_address IS 'IP address of the user who performed the action';
COMMENT ON COLUMN audit_logs.user_agent IS 'User agent string of the client';
