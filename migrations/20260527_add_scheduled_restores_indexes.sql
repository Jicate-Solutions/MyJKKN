-- Optimize queue polling and filtering
CREATE INDEX IF NOT EXISTS idx_scheduled_restores_status_scheduled_for
  ON scheduled_restores(status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_scheduled_restores_created_by_created_at
  ON scheduled_restores(created_by, created_at DESC);

-- For monitoring dashboard
GRANT SELECT ON scheduled_restores TO authenticated;
GRANT SELECT ON profiles TO authenticated; -- For user lookup
