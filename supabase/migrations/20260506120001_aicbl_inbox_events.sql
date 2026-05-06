-- aicbl_inbox_events — idempotency tracking for events received from AICBL
-- Applied via Supabase Management API on 2026-05-06 (feat/aicbl-pde-bridge).
-- Part of the PDE external-provider bridge: AICBL → MyJKKN.

CREATE TABLE IF NOT EXISTS aicbl_inbox_events (
  event_id uuid PRIMARY KEY,
  event_type text NOT NULL,
  client_id text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'skipped')),
  error_message text,
  pde_portfolio_id uuid,
  pde_capability_progress_id uuid,
  evidence_mapping_id uuid
);

CREATE INDEX IF NOT EXISTS idx_aicbl_inbox_events_received
  ON aicbl_inbox_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_aicbl_inbox_events_client_type
  ON aicbl_inbox_events (client_id, event_type);

ALTER TABLE aicbl_inbox_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'aicbl_inbox_events'
      AND policyname = 'service_role_all_aicbl_inbox'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_aicbl_inbox"
      ON aicbl_inbox_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)';
  END IF;
END$$;

COMMENT ON TABLE aicbl_inbox_events IS
  'PDE bridge: received events from AICBL platform. Idempotent via event_id PK.';
