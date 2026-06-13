CREATE TABLE IF NOT EXISTS school_defaults_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  school_id uuid NOT NULL REFERENCES institutions(id),
  school_name text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('degree', 'department')),
  changes jsonb NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_school_defaults_audit_school_id ON school_defaults_audit_logs(school_id);
CREATE INDEX idx_school_defaults_audit_created_at ON school_defaults_audit_logs(created_at);
