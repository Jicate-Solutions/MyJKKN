-- ============================================================================
-- General Events Module — Phase 1A, Migration 1 of 5
-- File: 20260417000001_events_phase_1a_extend_events_and_categories.sql
-- Purpose: Extend `events` (22 cols) + `event_categories` (6 cols) for resource-first arch
-- Spec: specs/myjkkn-events-module-spec-v2-resource-first.md
-- Date: 2026-04-17
-- Strategy: Purely additive (ADD COLUMN IF NOT EXISTS / DO-block guards). Idempotent.
-- Approval: Director reviews SQL before apply via Supabase MCP on prod (kvizhngldtiuufknvehv).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Extend `events` (36 → ~58 cols)
-- ----------------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_category_id        UUID,
  ADD COLUMN IF NOT EXISTS proposed_by              UUID,
  ADD COLUMN IF NOT EXISTS is_emergency             BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emergency_reason         TEXT,
  ADD COLUMN IF NOT EXISTS is_sensitive             BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_chain_snapshot  JSONB,
  ADD COLUMN IF NOT EXISTS venue_text               TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by            UUID,
  ADD COLUMN IF NOT EXISTS supersede_reason         TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_pattern       TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id     UUID,
  ADD COLUMN IF NOT EXISTS visibility               TEXT        NOT NULL DEFAULT 'institution',
  ADD COLUMN IF NOT EXISTS requires_od              BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_audience          JSONB,
  ADD COLUMN IF NOT EXISTS scope                    TEXT        NOT NULL DEFAULT 'institution',
  ADD COLUMN IF NOT EXISTS budget_estimate          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cap_behavior             TEXT        NOT NULL DEFAULT 'waitlist',
  ADD COLUMN IF NOT EXISTS status_lifecycle_stage   TEXT,
  ADD COLUMN IF NOT EXISTS closure_enforced         BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS naac_criteria            TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS okr_kr_id                UUID,
  ADD COLUMN IF NOT EXISTS iqac_evidence_status     TEXT        NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS poster_url               TEXT,
  ADD COLUMN IF NOT EXISTS caption_text             TEXT,
  ADD COLUMN IF NOT EXISTS social_published_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS social_platforms         TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CHECK constraints (idempotent via DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_visibility_check') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_visibility_check
      CHECK (visibility IN ('public','all_jkkn','institution','invited'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_scope_check') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_scope_check
      CHECK (scope IN ('chapter','institution','all_jkkn'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_cap_behavior_check') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_cap_behavior_check
      CHECK (cap_behavior IN ('strict_cap','waitlist','allow_overflow'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_iqac_evidence_status_check') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_iqac_evidence_status_check
      CHECK (iqac_evidence_status IN ('draft','pending_validation','validated','submitted_to_naac','rejected'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_emergency_requires_reason_check') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_emergency_requires_reason_check
      CHECK (is_emergency = false OR emergency_reason IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_venue_at_least_one_check') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_venue_at_least_one_check
      CHECK (venue_resource_id IS NOT NULL OR venue_text IS NOT NULL OR venue IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_supersede_self_fk') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_supersede_self_fk
      FOREIGN KEY (superseded_by) REFERENCES public.events(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_recurrence_parent_self_fk') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_recurrence_parent_self_fk
      FOREIGN KEY (recurrence_parent_id) REFERENCES public.events(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for IQAC dashboards + filtering
CREATE INDEX IF NOT EXISTS idx_events_category               ON public.events(event_category_id);
CREATE INDEX IF NOT EXISTS idx_events_visibility             ON public.events(visibility);
CREATE INDEX IF NOT EXISTS idx_events_scope                  ON public.events(scope);
CREATE INDEX IF NOT EXISTS idx_events_status_lifecycle       ON public.events(status_lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_events_date_range             ON public.events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_proposed_by            ON public.events(proposed_by);
CREATE INDEX IF NOT EXISTS idx_events_iqac_evidence_status   ON public.events(iqac_evidence_status);
CREATE INDEX IF NOT EXISTS idx_events_okr_kr                 ON public.events(okr_kr_id) WHERE okr_kr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_naac_criteria_gin      ON public.events USING GIN(naac_criteria);
CREATE INDEX IF NOT EXISTS idx_events_superseded_by          ON public.events(superseded_by) WHERE superseded_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_recurrence_parent      ON public.events(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- B. Extend `event_categories` (17 → 23 cols)
-- ----------------------------------------------------------------------------

ALTER TABLE public.event_categories
  ADD COLUMN IF NOT EXISTS approval_chain_template JSONB       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_docs_config    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_visibility      TEXT        NOT NULL DEFAULT 'institution',
  ADD COLUMN IF NOT EXISTS default_od_trigger      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_cap_behavior    TEXT        NOT NULL DEFAULT 'waitlist',
  ADD COLUMN IF NOT EXISTS priority_order          INTEGER     NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_categories_default_visibility_check') THEN
    ALTER TABLE public.event_categories ADD CONSTRAINT event_categories_default_visibility_check
      CHECK (default_visibility IN ('public','all_jkkn','institution','invited'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_categories_default_cap_behavior_check') THEN
    ALTER TABLE public.event_categories ADD CONSTRAINT event_categories_default_cap_behavior_check
      CHECK (default_cap_behavior IN ('strict_cap','waitlist','allow_overflow'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- C. FK events.event_category_id → event_categories.id (now that target is ready)
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_event_category_id_fk') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_event_category_id_fk
      FOREIGN KEY (event_category_id) REFERENCES public.event_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK SQL (for reference — DO NOT execute unless rolling back)
-- ============================================================================
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_category_id_fk;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_recurrence_parent_self_fk;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_supersede_self_fk;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_venue_at_least_one_check;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_emergency_requires_reason_check;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_iqac_evidence_status_check;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_cap_behavior_check;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_scope_check;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_visibility_check;
-- ALTER TABLE public.events
--   DROP COLUMN IF EXISTS event_category_id,
--   DROP COLUMN IF EXISTS proposed_by,
--   DROP COLUMN IF EXISTS is_emergency,
--   DROP COLUMN IF EXISTS emergency_reason,
--   DROP COLUMN IF EXISTS is_sensitive,
--   DROP COLUMN IF EXISTS approval_chain_snapshot,
--   DROP COLUMN IF EXISTS venue_text,
--   DROP COLUMN IF EXISTS superseded_by,
--   DROP COLUMN IF EXISTS supersede_reason,
--   DROP COLUMN IF EXISTS recurrence_pattern,
--   DROP COLUMN IF EXISTS recurrence_parent_id,
--   DROP COLUMN IF EXISTS visibility,
--   DROP COLUMN IF EXISTS requires_od,
--   DROP COLUMN IF EXISTS target_audience,
--   DROP COLUMN IF EXISTS scope,
--   DROP COLUMN IF EXISTS budget_estimate,
--   DROP COLUMN IF EXISTS cap_behavior,
--   DROP COLUMN IF EXISTS status_lifecycle_stage,
--   DROP COLUMN IF EXISTS closure_enforced,
--   DROP COLUMN IF EXISTS naac_criteria,
--   DROP COLUMN IF EXISTS okr_kr_id,
--   DROP COLUMN IF EXISTS iqac_evidence_status,
--   DROP COLUMN IF EXISTS poster_url,
--   DROP COLUMN IF EXISTS caption_text,
--   DROP COLUMN IF EXISTS social_published_at,
--   DROP COLUMN IF EXISTS social_platforms;
-- ALTER TABLE public.event_categories
--   DROP COLUMN IF EXISTS approval_chain_template,
--   DROP COLUMN IF EXISTS required_docs_config,
--   DROP COLUMN IF EXISTS default_visibility,
--   DROP COLUMN IF EXISTS default_od_trigger,
--   DROP COLUMN IF EXISTS default_cap_behavior,
--   DROP COLUMN IF EXISTS priority_order;
