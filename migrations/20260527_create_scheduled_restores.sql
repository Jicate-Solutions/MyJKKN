CREATE TABLE scheduled_restores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_ids TEXT[] NOT NULL,
  resource_type VARCHAR(20) CHECK (resource_type IN ('degree', 'department')),
  scheduled_for TIMESTAMP NOT NULL,
  status VARCHAR(20) CHECK (status IN ('pending', 'completed', 'failed')) DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  executed_at TIMESTAMP,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scheduled_restores_status ON scheduled_restores(status);
CREATE INDEX idx_scheduled_restores_scheduled_for ON scheduled_restores(scheduled_for);
CREATE INDEX idx_scheduled_restores_created_by ON scheduled_restores(created_by);
