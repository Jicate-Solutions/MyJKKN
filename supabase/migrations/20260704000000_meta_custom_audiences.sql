-- ============================================================================
-- Migration: 20260704000000_meta_custom_audiences
-- Meta Custom Audiences integration substrate (Agent η).
-- ============================================================================
-- Adds:
--   1. meta_audience_rules         — rule registry (criteria + sync target)
--   2. meta_audience_sync_history  — append-only audit of each sync run
--   3. RLS: institution-scoped read, admin-only writes
--   4. Two platform_policies seeds:
--        meta.audiences.is_enabled         bool default false
--        meta.audiences.sync_batch_size    int  default 10000
-- Idempotent. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. meta_audience_rules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta_audience_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  platform          TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  ad_account_id     TEXT NOT NULL,
  criteria          JSONB NOT NULL DEFAULT '{}'::jsonb,
  audience_size     INT NOT NULL DEFAULT 0,
  sync_status       TEXT NOT NULL DEFAULT 'pending'
                      CHECK (sync_status IN ('pending','syncing','synced','failed')),
  meta_audience_id  TEXT,
  last_synced_at    TIMESTAMPTZ,
  is_enabled        BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES profiles(id),
  updated_by        UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_meta_audience_rules_inst
  ON meta_audience_rules (institution_id);
CREATE INDEX IF NOT EXISTS idx_meta_audience_rules_platform
  ON meta_audience_rules (platform, is_enabled);
CREATE INDEX IF NOT EXISTS idx_meta_audience_rules_sync_status
  ON meta_audience_rules (sync_status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_audience_rules_inst_name
  ON meta_audience_rules (institution_id, name);

COMMENT ON TABLE meta_audience_rules IS
  'Meta Custom Audience rule registry. One row = one targeted audience that '
  'gets synced from MyJKKN data into Meta Ads Manager. See Agent η spec.';
COMMENT ON COLUMN meta_audience_rules.criteria IS
  'JSONB criteria describing WHO belongs in this audience. Shape: '
  '{"source": "admission_leads"|"learners"|"alumni", "filters": {...}}. '
  'Filters are interpreted by lib/services/marketing/remarketing-service.ts.';
COMMENT ON COLUMN meta_audience_rules.meta_audience_id IS
  'Meta-side audience id returned from createAudience. NULL until first sync.';

-- ----------------------------------------------------------------------------
-- 2. meta_audience_sync_history
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta_audience_sync_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id          UUID NOT NULL REFERENCES meta_audience_rules(id) ON DELETE CASCADE,
  batch_size       INT NOT NULL DEFAULT 0,
  num_received     INT NOT NULL DEFAULT 0,
  num_invalid      INT NOT NULL DEFAULT 0,
  num_skipped      INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL CHECK (status IN ('pending','syncing','synced','failed')),
  error            TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_meta_audience_sync_history_rule
  ON meta_audience_sync_history (rule_id, started_at DESC);

COMMENT ON TABLE meta_audience_sync_history IS
  'Append-only audit log of each sync run. One row per rule per sync attempt.';

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger on rules
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_meta_audience_rules_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_audience_rules_touch ON meta_audience_rules;
CREATE TRIGGER trg_meta_audience_rules_touch
  BEFORE UPDATE ON meta_audience_rules
  FOR EACH ROW
  EXECUTE FUNCTION fn_meta_audience_rules_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE meta_audience_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_audience_sync_history ENABLE ROW LEVEL SECURITY;

-- meta_audience_rules: institution-scoped read; admin write.
DROP POLICY IF EXISTS meta_audience_rules_select ON meta_audience_rules;
CREATE POLICY meta_audience_rules_select ON meta_audience_rules
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_super_admin()
      OR is_admin()
      OR institution_id IN (
        SELECT p.institution_id FROM profiles p WHERE p.id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS meta_audience_rules_insert ON meta_audience_rules;
CREATE POLICY meta_audience_rules_insert ON meta_audience_rules
  FOR INSERT
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS meta_audience_rules_update ON meta_audience_rules;
CREATE POLICY meta_audience_rules_update ON meta_audience_rules
  FOR UPDATE
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS meta_audience_rules_delete ON meta_audience_rules;
CREATE POLICY meta_audience_rules_delete ON meta_audience_rules
  FOR DELETE
  USING (is_super_admin() OR is_admin());

-- meta_audience_sync_history: read via parent rule scope; only service_role
-- writes (the cron + the API route, both via service-role client).
DROP POLICY IF EXISTS meta_audience_sync_history_select ON meta_audience_sync_history;
CREATE POLICY meta_audience_sync_history_select ON meta_audience_sync_history
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      is_super_admin()
      OR is_admin()
      OR rule_id IN (
        SELECT r.id FROM meta_audience_rules r
        WHERE r.institution_id IN (
          SELECT p.institution_id FROM profiles p WHERE p.id = auth.uid()
        )
      )
    )
  );

-- No INSERT/UPDATE/DELETE policy — only service_role can write. Default-deny.

-- ----------------------------------------------------------------------------
-- 5. platform_policies seeds
-- ----------------------------------------------------------------------------
INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system)
VALUES
  ('meta.audiences.is_enabled', 'global', NULL, 'false'::jsonb,
   'Master kill-switch for Meta Custom Audiences sync. Set true after the '
   'Meta app has ads_management + business_management approved and the env '
   'vars META_ACCESS_TOKEN + META_AD_ACCOUNT_ID are populated.',
   'boolean', true),
  ('meta.audiences.sync_batch_size', 'global', NULL, '10000'::jsonb,
   'Max user rows per Meta /{audience}/users call. Meta hard-caps at 10000 '
   'per docs; we mirror that. Smaller values reduce blast radius on a '
   'failed batch but increase API round-trips.',
   'number', true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO NOTHING;

-- ----------------------------------------------------------------------------
-- End
-- ----------------------------------------------------------------------------
