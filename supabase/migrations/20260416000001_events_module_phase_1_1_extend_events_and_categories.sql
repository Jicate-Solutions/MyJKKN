-- ============================================================================
-- General Events Module — Phase 1.1
-- Extend `events` table (19 cols) + `event_categories` (5 cols) + event_category_config (NEW)
-- Spec: /Users/omm/PROJECTS/MyJKKN/specs/myjkkn-general-events-module-spec.md
-- Date: 2026-04-16
-- Author: Omm (via /myjkkn-api after /assumption-thrash)
-- Strategy: Purely additive (ADD COLUMN / CREATE IF NOT EXISTS). No destructive ops.
-- Approval: Director reviews before apply; apply to staging (hhprjbgknupaplivtoib) via Supabase MCP.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Extend `events` (36 → ~55 cols)
-- Adds: category FK, scope, visibility, emergency, sensitivity, venue hybrid,
-- recurrence, proposal ownership, OD trigger, target audience, approval snapshot,
-- supersede self-FK, budget.
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
  ADD COLUMN IF NOT EXISTS closure_enforced         BOOLEAN     NOT NULL DEFAULT false;

-- FK: event_category_id → event_categories.id (we extend event_categories below; FK added in Phase 1.2 after table ready)
-- FK: proposed_by → profiles.id (we defer adding FK constraint to Phase 1.3 migration to avoid locking profiles table now)

-- CHECK constraints (idempotent via DO block to guard against re-runs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_visibility_check') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_visibility_check
      CHECK (visibility IN ('public','all_jkkn','institution','invited'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_scope_check') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_scope_check
      CHECK (scope IN ('chapter','institution','all_jkkn'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_cap_behavior_check') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_cap_behavior_check
      CHECK (cap_behavior IN ('strict_cap','waitlist','allow_overflow'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_venue_at_least_one_check') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_venue_at_least_one_check
      CHECK (venue_resource_id IS NOT NULL OR venue_text IS NOT NULL OR venue IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_emergency_requires_reason_check') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_emergency_requires_reason_check
      CHECK (is_emergency = false OR emergency_reason IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_supersede_self_fk') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_supersede_self_fk
      FOREIGN KEY (superseded_by) REFERENCES public.events(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_recurrence_parent_self_fk') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_recurrence_parent_self_fk
      FOREIGN KEY (recurrence_parent_id) REFERENCES public.events(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_events_category         ON public.events(event_category_id);
CREATE INDEX IF NOT EXISTS idx_events_visibility       ON public.events(visibility);
CREATE INDEX IF NOT EXISTS idx_events_scope            ON public.events(scope);
CREATE INDEX IF NOT EXISTS idx_events_status_lifecycle ON public.events(status_lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_events_date_range       ON public.events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_proposed_by      ON public.events(proposed_by);
CREATE INDEX IF NOT EXISTS idx_events_superseded_by    ON public.events(superseded_by) WHERE superseded_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_recurrence_parent ON public.events(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- B. Extend `event_categories` (17 → 22 cols)
-- Adds: approval_chain_template, required_docs_config, default_visibility,
-- default_od_trigger, default_cap_behavior, is_active, priority_order
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
    ALTER TABLE public.event_categories
      ADD CONSTRAINT event_categories_default_visibility_check
      CHECK (default_visibility IN ('public','all_jkkn','institution','invited'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_categories_default_cap_behavior_check') THEN
    ALTER TABLE public.event_categories
      ADD CONSTRAINT event_categories_default_cap_behavior_check
      CHECK (default_cap_behavior IN ('strict_cap','waitlist','allow_overflow'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- C. Add FK on events.event_category_id now that event_categories has the fields it needs
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_event_category_id_fk') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_event_category_id_fk
      FOREIGN KEY (event_category_id) REFERENCES public.event_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- END Phase 1.1
-- ============================================================================
-- Next: Phase 1.2 = 16 new child tables (sessions, waitlist, approval_flows,
--                   approvals, creative_assets, creative_asset_templates,
--                   social_media_publish_queue, conflict_overrides,
--                   sensitive_details, closeout_reports, certificates,
--                   certificate_templates, feedback, naac_mapping,
--                   approver_delegations, category_config)
