-- ============================================================================
-- General Events Module — Phase 1A, Migration 3 of 5
-- File: 20260417000003_events_phase_1a_new_tables.sql
-- Purpose: 5 new tables — bundles + human_roles + sessions + waitlist + emergency_log
-- Spec: specs/myjkkn-events-module-spec-v2-resource-first.md (decisions Q1, Q5, Q7, Q10, Q18)
-- Date: 2026-04-17
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. event_resource_bundles — group multiple reservations (AV bundle, Catering bundle)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_resource_bundles (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  bundle_name     TEXT         NOT NULL,
  bundle_type     TEXT         NOT NULL,  -- av | catering | transport | decoration | venue | creative | other
  status          TEXT         NOT NULL DEFAULT 'pending',
  caretaker_user_id UUID,
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT event_resource_bundles_type_check
    CHECK (bundle_type IN ('av','catering','transport','decoration','venue','creative','other')),
  CONSTRAINT event_resource_bundles_status_check
    CHECK (status IN ('pending','approved','rejected','cancelled','fully_reserved'))
);

CREATE INDEX IF NOT EXISTS idx_event_resource_bundles_event ON public.event_resource_bundles(event_id);
CREATE INDEX IF NOT EXISTS idx_event_resource_bundles_status ON public.event_resource_bundles(status);

-- Add nullable bundle_id to resource_reservations (links a reservation to its bundle)
ALTER TABLE public.resource_reservations
  ADD COLUMN IF NOT EXISTS bundle_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_reservations_bundle_id_fk') THEN
    ALTER TABLE public.resource_reservations ADD CONSTRAINT resource_reservations_bundle_id_fk
      FOREIGN KEY (bundle_id) REFERENCES public.event_resource_bundles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. event_human_roles — coordinator/speaker/volunteer/etc + honorarium tracking
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_human_roles (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id            UUID,                 -- NULL for external (non-MyJKKN) people
  external_contact   JSONB,                -- {name, email, phone, designation, organization} for external roles
  role_type          TEXT         NOT NULL,
  assignment_status  TEXT         NOT NULL DEFAULT 'invited',
  honorarium_amount  NUMERIC(12,2),        -- NULL = unpaid/internal
  honorarium_status  TEXT         NOT NULL DEFAULT 'not_applicable',
  payment_method     TEXT,                  -- cash | bank_transfer | cheque | vendor_invoice
  vendor_invoice_id  UUID,                  -- future FK to billing module
  notes              TEXT,
  assigned_by        UUID,
  assigned_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  responded_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT event_human_roles_role_type_check
    CHECK (role_type IN (
      'coordinator','speaker','volunteer','security','photographer','videographer',
      'firstaid','catering_staff','host','emcee','judge','usher'
    )),
  CONSTRAINT event_human_roles_assignment_status_check
    CHECK (assignment_status IN ('invited','accepted','declined','cancelled','completed')),
  CONSTRAINT event_human_roles_honorarium_status_check
    CHECK (honorarium_status IN ('not_applicable','pending','approved','paid','rejected')),
  CONSTRAINT event_human_roles_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('cash','bank_transfer','cheque','vendor_invoice')),
  CONSTRAINT event_human_roles_user_or_external_check
    CHECK (user_id IS NOT NULL OR external_contact IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_event_human_roles_event ON public.event_human_roles(event_id);
CREATE INDEX IF NOT EXISTS idx_event_human_roles_user ON public.event_human_roles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_human_roles_role_type ON public.event_human_roles(role_type);
CREATE INDEX IF NOT EXISTS idx_event_human_roles_honorarium_status ON public.event_human_roles(honorarium_status);

-- ----------------------------------------------------------------------------
-- 3. event_sessions — multi-day session details (Day 1 inauguration, Day 2 workshop)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_sessions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title               TEXT         NOT NULL,
  description         TEXT,
  start_at            TIMESTAMPTZ  NOT NULL,
  end_at              TIMESTAMPTZ  NOT NULL,
  day_number          INTEGER,
  session_order       INTEGER      NOT NULL DEFAULT 1,
  venue_resource_id   UUID,
  venue_text          TEXT,
  primary_speaker_id  UUID,                  -- FK to event_human_roles when role_type='speaker'
  max_participants    INTEGER,
  status              TEXT         NOT NULL DEFAULT 'scheduled',
  created_by          UUID,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT event_sessions_time_order_check CHECK (end_at > start_at),
  CONSTRAINT event_sessions_status_check
    CHECK (status IN ('scheduled','in_progress','completed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_event_sessions_event ON public.event_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_sessions_time_range ON public.event_sessions(start_at, end_at);

-- Now add the session_id FK on resource_reservations (deferred from Migration 2)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_reservations_session_id_fk') THEN
    ALTER TABLE public.resource_reservations ADD CONSTRAINT resource_reservations_session_id_fk
      FOREIGN KEY (session_id) REFERENCES public.event_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. event_waitlist — capacity overflow queue (registrations + resources)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_waitlist (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                 UUID         REFERENCES public.events(id) ON DELETE CASCADE,
  resource_reservation_id  UUID         REFERENCES public.resource_reservations(id) ON DELETE CASCADE,
  user_id                  UUID         NOT NULL,
  position                 INTEGER      NOT NULL,
  joined_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  promoted_at              TIMESTAMPTZ,
  status                   TEXT         NOT NULL DEFAULT 'waiting',
  notes                    TEXT,

  CONSTRAINT event_waitlist_target_check
    CHECK ((event_id IS NOT NULL AND resource_reservation_id IS NULL)
        OR (event_id IS NULL AND resource_reservation_id IS NOT NULL)),
  CONSTRAINT event_waitlist_status_check
    CHECK (status IN ('waiting','promoted','expired','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_event_waitlist_event_pos ON public.event_waitlist(event_id, position) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_waitlist_reservation_pos ON public.event_waitlist(resource_reservation_id, position) WHERE resource_reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_waitlist_user ON public.event_waitlist(user_id);

-- ----------------------------------------------------------------------------
-- 5. events_emergency_overrides_log — audit trail for is_emergency overrides
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.events_emergency_overrides_log (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                    UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  overridden_by               UUID         NOT NULL,
  override_reason             TEXT         NOT NULL,
  bumped_reservation_ids      UUID[]       NOT NULL DEFAULT ARRAY[]::UUID[],
  bypassed_maintenance_ids    UUID[]       NOT NULL DEFAULT ARRAY[]::UUID[],
  notified_user_ids           UUID[]       NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_emergency_log_event ON public.events_emergency_overrides_log(event_id);
CREATE INDEX IF NOT EXISTS idx_events_emergency_log_override_by ON public.events_emergency_overrides_log(overridden_by);
CREATE INDEX IF NOT EXISTS idx_events_emergency_log_created ON public.events_emergency_overrides_log(created_at DESC);

-- ============================================================================
-- ROLLBACK SQL (for reference)
-- ============================================================================
-- DROP TABLE IF EXISTS public.events_emergency_overrides_log;
-- DROP TABLE IF EXISTS public.event_waitlist;
-- ALTER TABLE public.resource_reservations DROP CONSTRAINT IF EXISTS resource_reservations_session_id_fk;
-- DROP TABLE IF EXISTS public.event_sessions;
-- DROP TABLE IF EXISTS public.event_human_roles;
-- ALTER TABLE public.resource_reservations DROP CONSTRAINT IF EXISTS resource_reservations_bundle_id_fk;
-- ALTER TABLE public.resource_reservations DROP COLUMN IF EXISTS bundle_id;
-- DROP TABLE IF EXISTS public.event_resource_bundles;
