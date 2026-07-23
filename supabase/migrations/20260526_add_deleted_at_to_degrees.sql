-- Add soft delete column to degrees table
ALTER TABLE degrees ADD COLUMN deleted_at timestamp with time zone;
CREATE INDEX idx_degrees_deleted_at ON degrees(deleted_at);

-- Update audit_logs constraint to support restore action
ALTER TABLE school_defaults_audit_logs
  DROP CONSTRAINT school_defaults_audit_logs_action_check;

ALTER TABLE school_defaults_audit_logs
  ADD CONSTRAINT school_defaults_audit_logs_action_check
  CHECK (action IN ('create', 'update', 'delete', 'restore'));
