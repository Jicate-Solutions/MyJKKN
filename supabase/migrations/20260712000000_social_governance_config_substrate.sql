-- ============================================================================
-- Migration: 20260712000000_social_governance_config_substrate
-- Social Governance control-plane — config substrate
-- ============================================================================
-- Extends the CANONICAL config substrate (platform_policies + fn_get_policy_*
-- from 20260429000002_platform_policies_substrate) with the tunables that drive
-- MyJKKN's Social Governance control plane (dormancy detection, compliance
-- floors, follow-back heuristics, the live-publish master switch, and the
-- digest shape). It also extends the social_dept_accounts registry
-- (20260610100000_social_dept_accounts_registry) with the lifecycle + ownership
-- + cadence columns the governance UI reconciles against.
--
-- WHY platform_policies (not a new social_*_config table):
--   These are simple org-wide scalar/array tunables a super-admin tweaks. They
--   have no relational FKs and need no per-row history beyond what
--   platform_policies already provides. Per docs/architecture/config-table-pattern.md,
--   platform_policies is the canonical store for exactly this class of value;
--   app code reads them at runtime via fn_get_policy_* (NEVER a raw SELECT).
--
-- platform_policies row shape (verbatim from the substrate migration):
--   policy_key TEXT, scope_type TEXT CHECK in (global|institution|role|user),
--   scope_id UUID, value JSONB, description TEXT, data_type TEXT CHECK in
--   (number|string|boolean|array|object|enum), enum_options JSONB, is_system BOOL.
--   NOTE: there is NO display_name column — the human label lives in `description`.
--   Idempotency = ON CONFLICT (policy_key, scope_type, COALESCE(scope_id,sentinel))
--   DO NOTHING, which is the table's WHERE-NOT-EXISTS equivalent for the unique key.
--
-- TIER 0/1 — additive only: seeds rows + ADD COLUMN IF NOT EXISTS. No drops,
-- no rewrites of existing functions. Idempotent. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed Social Governance policies into platform_policies (idempotent).
--    All seeded as is_system=true GLOBAL rows so the super-admin policy UI
--    renders them (label from `description`, type-aware editor from `data_type`).
-- ----------------------------------------------------------------------------
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system) VALUES
('social.dormancy_threshold_days', 'global', NULL, '60'::jsonb,
  'Days with no new post before a department handle is flagged dormant',
  'number', NULL, true),

('social.compliance_min_followers', 'global', NULL, '150'::jsonb,
  'Minimum followers for a department handle to be considered compliant',
  'number', NULL, true),

('social.compliance_min_posts', 'global', NULL, '12'::jsonb,
  'Minimum total posts for a department handle to be considered compliant',
  'number', NULL, true),

('social.followback_ratio_threshold', 'global', NULL, '"0.7"'::jsonb,
  'following/followers ratio above which a handle reads as follow-back / student-run rather than an official department channel',
  'string', NULL, true),

('social.realtime_enabled', 'global', NULL, 'false'::jsonb,
  'Master switch for live publishing. Keep OFF until Meta publish is proven end-to-end.',
  'boolean', NULL, true),

('social.digest_top_n', 'global', NULL, '5'::jsonb,
  'Number of top items shown per section in the Social Governance digest',
  'number', NULL, true),

('social.digest_categories', 'global', NULL,
  '{"dormant":"Dormant handles","noncompliant":"Below compliance floor","followback":"Likely student-run","new":"Newly registered","top_performers":"Top performers"}'::jsonb,
  'Digest section key -> human label mapping. Controls which categories the Social Governance digest renders and in what order.',
  'object', NULL, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Extend social_dept_accounts with governance lifecycle / ownership / cadence.
--    ADD COLUMN IF NOT EXISTS keeps this safe to re-apply and safe if a future
--    migration adds the same column first.
-- ----------------------------------------------------------------------------
ALTER TABLE public.social_dept_accounts
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'provisional';

-- CHECK constraint added separately + idempotently (ADD COLUMN can't carry a
-- named CHECK with IF NOT EXISTS semantics across re-applies).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_dept_accounts_lifecycle_status_check'
      AND conrelid = 'public.social_dept_accounts'::regclass
  ) THEN
    ALTER TABLE public.social_dept_accounts
      ADD CONSTRAINT social_dept_accounts_lifecycle_status_check
      CHECK (lifecycle_status IN ('official','provisional','deprecated','kill'));
  END IF;
END $$;

ALTER TABLE public.social_dept_accounts
  ADD COLUMN IF NOT EXISTS accountable_owner_id UUID NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.social_dept_accounts
  ADD COLUMN IF NOT EXISTS posting_cadence_days INT NULL;

-- ----------------------------------------------------------------------------
-- 3. Reload PostgREST schema cache so the new columns are visible to the REST
--    API / embeds immediately (raw DDL leaves the cache stale otherwise).
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
