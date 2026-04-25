-- ============================================================================
-- General Events Module — Phase 1A, Migration 2 of 5
-- File: 20260417000002_events_phase_1a_alter_resource_reservations.sql
-- Purpose: Link resource_reservations to events + add condition tracking
-- Spec: specs/myjkkn-events-module-spec-v2-resource-first.md (decisions Q1, Q7, Q13)
-- Date: 2026-04-17
-- Strategy: Purely additive. Idempotent.
-- ============================================================================

-- Add 6 cols to existing resource_reservations table (25 → 31 cols)
ALTER TABLE public.resource_reservations
  ADD COLUMN IF NOT EXISTS event_id            UUID,
  ADD COLUMN IF NOT EXISTS session_id          UUID,
  ADD COLUMN IF NOT EXISTS session_label       TEXT,
  ADD COLUMN IF NOT EXISTS pre_check_photos    JSONB,
  ADD COLUMN IF NOT EXISTS post_check_photos   JSONB,
  ADD COLUMN IF NOT EXISTS condition_status    TEXT;

-- FK: event_id → events.id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_reservations_event_id_fk') THEN
    ALTER TABLE public.resource_reservations ADD CONSTRAINT resource_reservations_event_id_fk
      FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
  END IF;

  -- session_id FK is added in Migration 3 (event_sessions table created there)

  -- CHECK: at most ONE of (event_id, session_id) is set (decision Q7)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_reservations_event_or_session_check') THEN
    ALTER TABLE public.resource_reservations ADD CONSTRAINT resource_reservations_event_or_session_check
      CHECK (NOT (event_id IS NOT NULL AND session_id IS NOT NULL));
  END IF;

  -- CHECK: condition_status enum (decision Q13)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_reservations_condition_status_check') THEN
    ALTER TABLE public.resource_reservations ADD CONSTRAINT resource_reservations_condition_status_check
      CHECK (condition_status IS NULL OR condition_status IN ('ok','minor_damage','major_damage','n/a'));
  END IF;
END $$;

-- Indexes for event-scoped queries
CREATE INDEX IF NOT EXISTS idx_resource_reservations_event_id
  ON public.resource_reservations(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resource_reservations_session_id
  ON public.resource_reservations(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resource_reservations_event_status
  ON public.resource_reservations(event_id, status) WHERE event_id IS NOT NULL;

-- ============================================================================
-- ROLLBACK SQL (for reference)
-- ============================================================================
-- ALTER TABLE public.resource_reservations DROP CONSTRAINT IF EXISTS resource_reservations_event_id_fk;
-- ALTER TABLE public.resource_reservations DROP CONSTRAINT IF EXISTS resource_reservations_event_or_session_check;
-- ALTER TABLE public.resource_reservations DROP CONSTRAINT IF EXISTS resource_reservations_condition_status_check;
-- ALTER TABLE public.resource_reservations
--   DROP COLUMN IF EXISTS event_id,
--   DROP COLUMN IF EXISTS session_id,
--   DROP COLUMN IF EXISTS session_label,
--   DROP COLUMN IF EXISTS pre_check_photos,
--   DROP COLUMN IF EXISTS post_check_photos,
--   DROP COLUMN IF EXISTS condition_status;
