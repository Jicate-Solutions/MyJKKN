-- =============================================================================
-- jicate-booking integration — F5 substrate
-- Migration: create_jicate_booking_mirror
-- Spec: specs/jicate-booking-integration-f4-f7-spec.md §3.2
-- Initiative: jicate-booking-multi-tenant-90d (verdict 2026-07-30)
-- Depends on: 20260502000005_create_jicate_booking_meeting_types.sql (logical
--             — no FK constraint to allow webhook-arrival ordering)
-- =============================================================================
--
-- Read-only mirror of Cal.com Booking rows from jicate-booking-prod
-- (project_ref fkihmsuwruohdgsqvnxg). Source of truth = Cal.com; this table is
-- eventually-consistent, refreshed by F4 webhook receiver at
-- /api/webhooks/jicate-booking. Never written from MyJKKN UI.
--
-- A4 of locked-initiative `jicate-booking-multi-tenant-90d` reads:
--   "JOINable record visible from MyJKKN's Supabase via cross-DB bridge
--    (webhook+mirror or Postgres FDW or scheduled sync — implementation deferred)"
-- This table IS the deferred implementation, choosing webhook+mirror per spec §2.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.jicate_booking_mirror (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cal.com identity
  cal_booking_uid text NOT NULL UNIQUE,
  cal_booking_id integer NOT NULL,
  cal_event_type_id integer,

  -- Host (the MyJKKN user who owns the time slot — soft-resolved by email)
  host_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  host_email text NOT NULL,
  host_name text,

  -- Attendee (external — student, parent, prospect, etc.)
  attendee_email text NOT NULL,
  attendee_name text,
  attendee_phone text,

  -- Schedule
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  timezone text,

  -- State (constrained — keep aligned with Cal.com webhook event vocabulary)
  status text NOT NULL,
  cancellation_reason text,
  reschedule_uid text,

  -- Provenance — every row carries the raw payload that produced it
  webhook_event text NOT NULL,
  webhook_received_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT jbm_status_check CHECK (
    status IN ('pending','confirmed','cancelled','rescheduled','completed','no_show')
  ),
  CONSTRAINT jbm_end_after_start CHECK (end_time > start_time)
);

COMMENT ON TABLE public.jicate_booking_mirror IS
  'F5 — read-only mirror of Cal.com bookings on jicate-booking-prod (Supabase project_ref fkihmsuwruohdgsqvnxg). Eventually-consistent. Source of truth lives in jicate-booking. Refreshed by /api/webhooks/jicate-booking (F4). Satisfies clause A4 of locked-initiative jicate-booking-multi-tenant-90d.';

COMMENT ON COLUMN public.jicate_booking_mirror.cal_booking_uid IS
  'Cal.com Booking.uid — UNIQUE primary identity. Per OPEN-2 (spec §6) reschedules create NEW uid; old row preserved with reschedule_uid pointer.';
COMMENT ON COLUMN public.jicate_booking_mirror.host_user_id IS
  'Soft FK to profiles.id resolved by email match. NULL when host_email has no profile yet (webhook arrival before profile sync). Reconciliation job backfills nightly per OPEN-4.';
COMMENT ON COLUMN public.jicate_booking_mirror.raw_payload IS
  'Full Cal.com webhook body. Preserved for replay/debugging. Do not query directly from app code — use the typed columns. PII redaction policy TBD before any logs export.';

-- Indexes for the inbox query path (host filter + start_time DESC paging)
CREATE INDEX IF NOT EXISTS idx_jbm_host_user_id_start
  ON public.jicate_booking_mirror(host_user_id, start_time DESC)
  WHERE status NOT IN ('cancelled');

CREATE INDEX IF NOT EXISTS idx_jbm_status_start
  ON public.jicate_booking_mirror(status, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_jbm_attendee_email
  ON public.jicate_booking_mirror(attendee_email);

CREATE INDEX IF NOT EXISTS idx_jbm_reschedule_uid
  ON public.jicate_booking_mirror(reschedule_uid)
  WHERE reschedule_uid IS NOT NULL;

-- updated_at trigger (separate fn from jbmt to avoid cross-coupling)
CREATE OR REPLACE FUNCTION public.tg_jbm_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jbm_set_updated_at ON public.jicate_booking_mirror;
CREATE TRIGGER jbm_set_updated_at
  BEFORE UPDATE ON public.jicate_booking_mirror
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_jbm_set_updated_at();

-- =============================================================================
-- RLS — hosts see their own; super_admin + director see all
-- =============================================================================

ALTER TABLE public.jicate_booking_mirror ENABLE ROW LEVEL SECURITY;

-- 1. Hosts see their own bookings
CREATE POLICY "jbm_host_sees_own"
  ON public.jicate_booking_mirror
  FOR SELECT
  TO authenticated
  USING (host_user_id = (SELECT auth.uid()));

-- 2. Super admin + director see all bookings (escalation/audit/operational view)
CREATE POLICY "jbm_super_admin_director_sees_all"
  ON public.jicate_booking_mirror
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('super_admin','director')
    )
  );

-- No INSERT/UPDATE/DELETE policies — service-role bypass for the webhook
-- receiver; regular users have no mutation path. This is intentional: A4 of
-- the lock requires "JOINable record" not "user-writable record".
