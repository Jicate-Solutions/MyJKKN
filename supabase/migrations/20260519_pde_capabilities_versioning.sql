-- =============================================================================
-- PDE Tier 2 Item 5 — capability versioning columns
-- =============================================================================
--
-- Adds version tracking + lifecycle columns to `pde_capabilities` and a
-- per-attestation snapshot on `pde_learner_capabilities` so that:
--
--   1. Curriculum owners can publish a new version of a capability without
--      destroying the old definition (creates a new row, marks old row
--      `superseded_by` -> new id).
--   2. Each `pde_learner_capabilities` row remembers WHICH version was
--      demonstrated, so historical attestations stay valid under the active
--      `pde.visibility.capability_versioning_policy` mode.
--   3. The `grandfathered` boolean lets the resolver display "v1 (legacy)"
--      vs "v2 (current)" without recomputing every read.
--
-- Pairs with:
--   - lib/services/pde-policy-reader.ts :: getCapabilityVersioningPolicy()
--   - lib/services/pde-capability-versioning-service.ts (new wrapper service)
--
-- Idempotent: re-running this migration is safe (IF NOT EXISTS on every DDL).
-- Phase: PDE Substrate Tier 2 (2026-05-19).
-- =============================================================================

-- 1) pde_capabilities — version lineage columns
ALTER TABLE public.pde_capabilities
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.pde_capabilities
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
  -- null = no expiry; respected by resolver when policy.mode = 'auto_expire'

ALTER TABLE public.pde_capabilities
  ADD COLUMN IF NOT EXISTS superseded_by UUID
  REFERENCES public.pde_capabilities(id) ON DELETE SET NULL;
  -- self-FK; old row points to its successor when a new version ships

COMMENT ON COLUMN public.pde_capabilities.version IS
  'Monotonically incremented per slug lineage; starts at 1 for every fresh capability.';
COMMENT ON COLUMN public.pde_capabilities.valid_until IS
  'Optional expiry timestamp; null means evergreen. Used by auto_expire policy mode.';
COMMENT ON COLUMN public.pde_capabilities.superseded_by IS
  'Points at the newer pde_capabilities row that replaces this one. Null = active head.';

-- 2) pde_learner_capabilities — per-attestation snapshot
ALTER TABLE public.pde_learner_capabilities
  ADD COLUMN IF NOT EXISTS capability_version INTEGER;
  -- snapshot of pde_capabilities.version at the moment the learner was
  -- attested; null on historical rows that pre-date this migration.

ALTER TABLE public.pde_learner_capabilities
  ADD COLUMN IF NOT EXISTS grandfathered BOOLEAN NOT NULL DEFAULT false;
  -- flipped true when policy.mode = 'grandfather_with_upgrade' AND the active
  -- capability version > the snapshot version on this row.

COMMENT ON COLUMN public.pde_learner_capabilities.capability_version IS
  'Version of pde_capabilities at the time of demonstration. Null on legacy rows.';
COMMENT ON COLUMN public.pde_learner_capabilities.grandfathered IS
  'True when this attestation predates a newer version of the same capability and the active policy grants legacy credit.';

-- 3) Indexes for the new lookup paths
CREATE INDEX IF NOT EXISTS idx_pde_capabilities_version
  ON public.pde_capabilities(version);

CREATE INDEX IF NOT EXISTS idx_pde_capabilities_superseded
  ON public.pde_capabilities(superseded_by)
  WHERE superseded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pde_capabilities_active_head
  ON public.pde_capabilities(slug)
  WHERE superseded_by IS NULL;
-- "active head" = latest non-superseded row; resolver queries this often.

-- 4) Light verification (SELECT-only — no INSERT smoke per policy)
DO $$
DECLARE
  missing_cols TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pde_capabilities' AND column_name = 'version'
  ) THEN missing_cols := array_append(missing_cols, 'pde_capabilities.version'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pde_capabilities' AND column_name = 'valid_until'
  ) THEN missing_cols := array_append(missing_cols, 'pde_capabilities.valid_until'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pde_capabilities' AND column_name = 'superseded_by'
  ) THEN missing_cols := array_append(missing_cols, 'pde_capabilities.superseded_by'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pde_learner_capabilities' AND column_name = 'capability_version'
  ) THEN missing_cols := array_append(missing_cols, 'pde_learner_capabilities.capability_version'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pde_learner_capabilities' AND column_name = 'grandfathered'
  ) THEN missing_cols := array_append(missing_cols, 'pde_learner_capabilities.grandfathered'); END IF;

  IF array_length(missing_cols, 1) > 0 THEN
    RAISE EXCEPTION 'pde-capability-versioning migration verification failed: missing %', missing_cols;
  END IF;
END $$;
