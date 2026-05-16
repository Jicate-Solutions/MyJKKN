-- 20260511000001_lead_active_stage_policy_substrate.sql
-- Phase 1A substrate: lead_active_stage_policy table + reader fn + 11 seed rows + RLS
--
-- WHY: The funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired',
-- 'lost','dormant') filter is hardcoded in fn_auto_assign_counselor_v2 (trigger) and
-- in migration 20260429000012 (4 sites). Director cannot tweak this list without an
-- engineering deploy. This migration ships the config substrate so future tweaks are
-- UI clicks in /admin/lead-stages-policy.
--
-- PATTERN: Substrate-first 4+1 (same as PRs #735/#736/#738/#745).
--   Phase 1A (this PR): table + reader fn + seed — zero behavioral drift
--   Phase 1B: admin UI page (/admin/lead-stages-policy)
--   Phase 1C: API route for super_admin writes
--   Phase 2:  rewrite 5 hardcoded sites to call fn_get_terminal_stages(institution_id)
--
-- IDEMPOTENCY: CREATE OR REPLACE FUNCTION + INSERT ... WHERE NOT EXISTS. Re-runnable.
-- ============================================================================

-- ============================================================================
-- TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_active_stage_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('global','institution')),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  funnel_stage text NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (scope_type, institution_id, funnel_stage),
  CHECK (
    (scope_type = 'global' AND institution_id IS NULL)
    OR (scope_type = 'institution' AND institution_id IS NOT NULL)
  )
);

COMMENT ON TABLE lead_active_stage_policy IS
  'Per-stage policy: which admission_leads.funnel_stage values count as "terminal" (excluded from counselor active-capacity counts). Director-tweakable via /admin/lead-stages-policy.';

-- ============================================================================
-- INDEX
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_lead_active_stage_policy_terminal
  ON lead_active_stage_policy(funnel_stage, is_terminal)
  WHERE is_terminal = true;

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE lead_active_stage_policy ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users (policy data, not PII)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_active_stage_policy'
      AND policyname = 'lead_active_stage_policy_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "lead_active_stage_policy_read"
        ON lead_active_stage_policy FOR SELECT
        TO authenticated
        USING (true)
    $policy$;
  END IF;
END $$;

-- Write: super_admin only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_active_stage_policy'
      AND policyname = 'lead_active_stage_policy_write_super_admin'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "lead_active_stage_policy_write_super_admin"
        ON lead_active_stage_policy FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'super_admin'
          )
        )
    $policy$;
  END IF;
END $$;

-- ============================================================================
-- READER FUNCTION (locked signature — Phase 2 consumers depend on this)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_get_terminal_stages(p_institution_id UUID DEFAULT NULL)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH effective AS (
    SELECT DISTINCT ON (funnel_stage) funnel_stage, is_terminal
    FROM lead_active_stage_policy
    WHERE
      scope_type = 'global'
      OR (scope_type = 'institution' AND institution_id = p_institution_id)
    ORDER BY funnel_stage, scope_type DESC  -- 'institution' > 'global' alphabetically, so institution wins
  )
  SELECT COALESCE(array_agg(funnel_stage ORDER BY funnel_stage), ARRAY[]::text[])
  FROM effective
  WHERE is_terminal = true;
$$;

COMMENT ON FUNCTION fn_get_terminal_stages IS
  'Returns terminal funnel_stages for capacity-exclusion. Institution-scoped overrides global. Empty array if no rows seeded.';

-- ============================================================================
-- SEED — 11 rows (mirrors current hardcoded behavior 1:1, zero behavioral drift)
--
-- TERMINAL (7): enrolled, confirmed, declined, withdrew, expired, lost, dormant
--   Source: fn_auto_assign_counselor_v2 NOT IN list + 20260429000012 (4 sites)
--
-- NON-TERMINAL (4): new, contacted, application_started, not_reachable
--   Source: current prod data (new=15169, contacted=321, application_started=211,
--   not_reachable=3)
-- ============================================================================

-- TERMINAL stages
INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'enrolled', true, 'Lead converted to student. Excluded from counselor capacity (terminal).'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='enrolled'
);

INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'confirmed', true, 'Admission confirmed, awaiting enrollment. Excluded from counselor capacity (terminal).'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='confirmed'
);

INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'declined', true, 'Applicant declined offer. Excluded from counselor capacity (terminal).'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='declined'
);

INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'withdrew', true, 'Applicant withdrew after initial engagement. Excluded from counselor capacity (terminal).'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='withdrew'
);

INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'expired', true, 'Offer expired without response. Excluded from counselor capacity (terminal).'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='expired'
);

INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'lost', true, 'Lead lost to another institution. Excluded from counselor capacity (terminal).'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='lost'
);

INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'dormant', true, 'No activity for extended period. Excluded from counselor capacity (terminal).'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='dormant'
);

-- NON-TERMINAL stages (active — count toward counselor capacity)
INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'new', false, 'Freshly created lead, not yet contacted. Counts toward counselor active capacity.'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='new'
);

INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'contacted', false, 'Counselor has made initial contact. Counts toward counselor active capacity.'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='contacted'
);

INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'application_started', false, 'Applicant has begun filling the application form. Counts toward counselor active capacity.'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='application_started'
);

INSERT INTO lead_active_stage_policy (scope_type, institution_id, funnel_stage, is_terminal, description)
SELECT 'global', NULL, 'not_reachable', false, 'Contact attempts made but lead is unreachable. Counts toward counselor active capacity.'
WHERE NOT EXISTS (
  SELECT 1 FROM lead_active_stage_policy
  WHERE scope_type='global' AND institution_id IS NULL AND funnel_stage='not_reachable'
);
