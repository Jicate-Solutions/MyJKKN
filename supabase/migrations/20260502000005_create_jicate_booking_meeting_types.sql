-- =============================================================================
-- jicate-booking integration — F6 substrate
-- Migration: create_jicate_booking_meeting_types
-- Spec: specs/jicate-booking-integration-f4-f7-spec.md §3.1
-- Initiative: jicate-booking-multi-tenant-90d (verdict 2026-07-30)
-- =============================================================================
--
-- Categorization table for Cal.com EventTypes hosted on jicate-booking-prod
-- (project_ref fkihmsuwruohdgsqvnxg). Each row is a MyJKKN-side label for a
-- Cal.com EventType — e.g., the "engg-counseling" EventType maps to internal_kind
-- 'admission_call' and is for meeting_for='counselor'. Used by /meetings/inbox
-- and downstream reporting/AI Pulse to interpret bookings.
--
-- Seeded by a follow-up migration after running the inspection script
-- scripts/jicate-booking/list-event-types.ts against jicate-booking-prod.
-- Not user-managed in F4-F7 — admin CRUD is out of scope this phase.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.jicate_booking_meeting_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cal.com identity (source of truth on jicate-booking-prod)
  cal_event_type_id integer NOT NULL UNIQUE,
  cal_event_type_slug text NOT NULL,

  -- MyJKKN-side categorization
  internal_kind text NOT NULL,
  meeting_for text NOT NULL,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT jbmt_internal_kind_check CHECK (
    internal_kind IN ('advisor_session','parent_meeting','office_hours','admission_call','other')
  ),
  CONSTRAINT jbmt_meeting_for_check CHECK (
    meeting_for IN ('counselor','faculty','staff','admin')
  )
);

COMMENT ON TABLE public.jicate_booking_meeting_types IS
  'F6 — MyJKKN-side categorization of Cal.com EventTypes hosted on jicate-booking-prod (Supabase project_ref fkihmsuwruohdgsqvnxg). Seeded by migration after inspection; not user-managed in F4-F7.';

COMMENT ON COLUMN public.jicate_booking_meeting_types.cal_event_type_id IS
  'Cal.com EventType.id on jicate-booking-prod. UNIQUE — one MyJKKN row per Cal.com EventType.';
COMMENT ON COLUMN public.jicate_booking_meeting_types.internal_kind IS
  'MyJKKN-side enum used by inbox UI + reporting. Extend the CHECK constraint when new kinds are needed.';
COMMENT ON COLUMN public.jicate_booking_meeting_types.meeting_for IS
  'Which MyJKKN role primarily owns this meeting type. Used by sidebar nav to decide which roles see /meetings.';

-- Index for the inbox query path (filter active rows by internal_kind)
CREATE INDEX IF NOT EXISTS idx_jbmt_internal_kind
  ON public.jicate_booking_meeting_types(internal_kind)
  WHERE is_active = true;

-- updated_at trigger using existing helper if present, else inline
CREATE OR REPLACE FUNCTION public.tg_jbmt_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jbmt_set_updated_at ON public.jicate_booking_meeting_types;
CREATE TRIGGER jbmt_set_updated_at
  BEFORE UPDATE ON public.jicate_booking_meeting_types
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_jbmt_set_updated_at();

-- RLS — read-only to authenticated; writes only via service-role (migrations + admin tooling)
ALTER TABLE public.jicate_booking_meeting_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jbmt_authenticated_read"
  ON public.jicate_booking_meeting_types
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — service-role bypasses RLS, regular users cannot mutate.
